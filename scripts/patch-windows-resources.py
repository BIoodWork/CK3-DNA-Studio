"""Set staged executable metadata/icons through Windows APIs, without rcedit.

Only RT_ICON, RT_GROUP_ICON and RT_VERSION resources may change. Every other
resource and executable section is hashed before/after and must remain intact.
No copyright owner is inferred or invented.
"""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
from pathlib import Path
import struct

import pefile

CHANGED_KINDS = {3, 14, 16}


def block(key, value=b'', children=(), text=False):
    result = bytearray(struct.pack('<HHH', 0, len(value) // 2 if text else len(value), int(text)))
    result.extend((key + '\0').encode('utf-16le'))
    result.extend(b'\0' * (-len(result) % 4))
    result.extend(value)
    for child in children:
        result.extend(b'\0' * (-len(result) % 4))
        result.extend(child)
    struct.pack_into('<H', result, 0, len(result))
    return bytes(result)


def version_resource(name, version):
    parts = version.split('.')
    if not 1 <= len(parts) <= 4 or any(not part.isdecimal() or not 0 <= int(part) <= 65535 for part in parts):
        raise ValueError('Expected a numeric Windows version with up to four components.')
    numbers = list(map(int, parts)) + [0] * (4 - len(parts))
    values = {'FileDescription': name, 'FileVersion': '.'.join(map(str, numbers)),
              'InternalName': name, 'OriginalFilename': name + '.exe',
              'ProductName': name, 'ProductVersion': version}
    table = block('040904b0', children=[block(key, (value + '\0').encode('utf-16le'), text=True)
                                      for key, value in values.items()], text=True)
    ms, ls = numbers[0] << 16 | numbers[1], numbers[2] << 16 | numbers[3]
    fixed = struct.pack('<13I', 0xFEEF04BD, 0x10000, ms, ls, ms, ls, 0x3F, 0, 0x40004, 1, 0, 0, 0)
    return block('VS_VERSION_INFO', fixed, [block('StringFileInfo', children=[table], text=True),
                 block('VarFileInfo', children=[block('Translation', struct.pack('<HH', 1033, 1200))], text=True)]), values


def icon_resources(ico):
    if len(ico) < 6 or struct.unpack_from('<HH', ico) != (0, 1):
        raise ValueError('Expected a Windows ICO file.')
    count = struct.unpack_from('<H', ico, 4)[0]
    if not 1 <= count <= 256 or len(ico) < 6 + count * 16:
        raise ValueError('Invalid ICO directory.')
    group = bytearray(struct.pack('<HHH', 0, 1, count))
    images = []
    for index in range(count):
        width, height, colors, reserved, planes, bits, length, offset = struct.unpack_from('<BBBBHHII', ico, 6 + index * 16)
        if not length or offset < 6 + count * 16 or offset + length > len(ico):
            raise ValueError('ICO contains an incomplete image.')
        images.append(ico[offset:offset + length])
        group.extend(struct.pack('<BBBBHHIH', width, height, colors, reserved, planes, bits, length, index + 1))
    return bytes(group), images


def snapshot(exe):
    with pefile.PE(str(exe)) as pe:
        resources, replaceable = {}, []
        for kind in pe.DIRECTORY_ENTRY_RESOURCE.entries:
            for item in kind.directory.entries:
                for language in item.directory.entries:
                    if kind.id in CHANGED_KINDS:
                        replaceable.append((kind.id, item.id, language.id))
                    else:
                        data = language.data.struct
                        resources[(str(kind.name or kind.id), str(item.name or item.id), language.id)] = hashlib.sha256(pe.get_data(data.OffsetToData, data.Size)).hexdigest()
        sections = {section.Name: hashlib.sha256(section.get_data()).hexdigest()
                    for section in pe.sections if section.Name.rstrip(b'\0') != b'.rsrc'}
        return (resources, sections), replaceable


def patch(exe, icon, name, version):
    before, replaceable = snapshot(exe)
    version_data, expected_strings = version_resource(name, version)
    group, images = icon_resources(icon.read_bytes())
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.BeginUpdateResourceW.argtypes = [wintypes.LPCWSTR, wintypes.BOOL]
    kernel.BeginUpdateResourceW.restype = wintypes.HANDLE
    kernel.UpdateResourceW.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.c_void_p, wintypes.WORD, ctypes.c_void_p, wintypes.DWORD]
    kernel.UpdateResourceW.restype = wintypes.BOOL
    kernel.EndUpdateResourceW.argtypes = [wintypes.HANDLE, wintypes.BOOL]
    kernel.EndUpdateResourceW.restype = wintypes.BOOL
    handle = kernel.BeginUpdateResourceW(str(exe), False)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())

    def update(kind, resource_id, language, data):
        payload = ctypes.create_string_buffer(data) if data is not None else None
        if not kernel.UpdateResourceW(handle, kind, resource_id, language, payload, len(data) if data is not None else 0):
            raise ctypes.WinError(ctypes.get_last_error())
    try:
        for kind, resource_id, language in replaceable:
            update(kind, resource_id, language, None)
        update(16, 1, 1033, version_data)
        for index, data in enumerate(images, 1):
            update(3, index, 1033, data)
        update(14, 1, 1033, group)
    except BaseException:
        kernel.EndUpdateResourceW(handle, True)
        raise
    if not kernel.EndUpdateResourceW(handle, False):
        raise ctypes.WinError(ctypes.get_last_error())
    if snapshot(exe)[0] != before:
        raise ValueError('A non-target resource or executable section changed.')
    with pefile.PE(str(exe)) as pe:
        actual = {}
        for info in getattr(pe, 'FileInfo', []):
            for entry in info:
                for table in getattr(entry, 'StringTable', []):
                    actual.update({key.decode(): value.decode() for key, value in table.entries.items()})
        if actual != expected_strings:
            raise ValueError('Executable metadata verification failed.')
        icons = next(entry for entry in pe.DIRECTORY_ENTRY_RESOURCE.entries if entry.id == 3)
        for index, expected in enumerate(images, 1):
            resource = next(entry for entry in icons.directory.entries if entry.id == index)
            data = resource.directory.entries[0].data.struct
            if pe.get_data(data.OffsetToData, data.Size) != expected:
                raise ValueError('Executable icon verification failed.')
    print('Verified Windows application metadata and icons; other resources/sections unchanged.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for argument in ('exe', 'icon', 'name', 'version'):
        parser.add_argument('--' + argument, required=True)
    args = parser.parse_args()
    patch(Path(args.exe).resolve(), Path(args.icon).resolve(), args.name, args.version)
