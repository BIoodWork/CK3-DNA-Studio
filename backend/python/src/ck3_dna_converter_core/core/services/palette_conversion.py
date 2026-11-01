"""Opt-in palette-coordinate approximation across installed portrait mods.

Compare all 256x256 byte-addressable target coordinates, dominant and recessive
separately. Palette sampling is a discrete CPU approximation of normalized UVs;
GPU interpolation, materials and mod-specific saturation can still differ.
"""
from __future__ import annotations
from array import array
from functools import lru_cache
from pathlib import Path
from io import BytesIO
import hashlib
import math
from PIL import Image


def _lab(r,g,b):
    rgb=[]
    for v in (r,g,b):
        x=v/255
        rgb.append(x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4)
    r,g,b=rgb
    xyz=((r*.4124564+g*.3575761+b*.1804375)/.95047,
         r*.2126729+g*.7151522+b*.072175,
         (r*.0193339+g*.119192+b*.9503041)/1.08883)
    f=[v**(1/3) if v>216/24389 else (24389/27*v+16)/116 for v in xyz]
    return (116*f[1]-16,500*(f[0]-f[1]),200*(f[1]-f[2]))


def palette(path: Path):
    try: raw=path.read_bytes()
    except OSError as exc: raise ValueError(f'Palette unavailable: {path.name}.') from exc
    return _load_palette(str(path),raw)


@lru_cache(maxsize=12)
def _load_palette(path,raw):
    try:
        with Image.open(BytesIO(raw)) as image:
            image=image.convert('RGBA');w,h=image.size;px=image.load()
            sampled=bytearray()
            for y in range(256):
                for x in range(256):sampled.extend(px[round(x*(w-1)/255),round(y*(h-1)/255)])
    except (OSError,ValueError) as exc: raise ValueError(f'Cannot read portrait palette {Path(path).name}: {exc}') from exc
    return {'sha':hashlib.sha256(raw).hexdigest(),'sampled':bytes(sampled),'size':(w,h)}


@lru_cache(maxsize=6)
def _lab_grid(sampled: bytes):
    grid=array('f')
    for i in range(0,len(sampled),4):grid.extend((*_lab(*sampled[i:i+3]),sampled[i+3]/255*100))
    return grid


def _rgba(p,x,y):
    i=(y*256+x)*4
    return tuple(p['sampled'][i:i+4])


def remap_color(values, source, target):
    if source['sha']==target['sha']:return tuple(values),None
    grid=_lab_grid(target['sampled']);out=[];distances=[];colors=[];seen={}
    for x,y in [tuple(values[:2]),tuple(values[2:])]:
        if (x,y) in seen:
            coords,distance,detail=seen[(x,y)];out.extend(coords);distances.append(distance);colors.append(detail);continue
        rgba=_rgba(source,x,y);lab=(*_lab(*rgba[:3]),rgba[3]/255*100)
        original=(y*256+x)*4
        best=original;bestd=sum((lab[j]-grid[original+j])**2 for j in range(4))
        for i in range(0,len(grid),4):
            distance=sum((lab[j]-grid[i+j])**2 for j in range(4))
            if distance<bestd-1e-8:bestd=distance;best=i
        idx=best//4;nx,ny=idx%256,idx//256
        out.extend((nx,ny));target_rgba=_rgba(target,nx,ny)
        distances.append(round(math.sqrt(sum((a-b)**2 for a,b in zip(_lab(*rgba[:3]),_lab(*target_rgba[:3])))),5))
        colors.append({'sourceRGBA':list(rgba),'targetRGBA':list(target_rgba)})
        seen[(x,y)]=((nx,ny),distances[-1],colors[-1])
    return tuple(out),{'paletteDistance':distances,'samples':colors,'sampling':'256x256 normalized byte-coordinate grid; CPU nearest texel; CIE Lab + alpha metric'}
