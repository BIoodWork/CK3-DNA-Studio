from __future__ import annotations
import base64
import importlib.util
from pathlib import Path
import struct
import sys
import time
import unittest
from unittest.mock import patch

MODULE=Path(__file__).resolve().parents[2]/'backend/python/live_game.py'
spec=importlib.util.spec_from_file_location('live_game',MODULE)
live=importlib.util.module_from_spec(spec);sys.modules['live_game']=live;spec.loader.exec_module(live)

class Memory:
    def __init__(self):
        self.base=0x140000000;self.pid=42;self.cells={};self.writes=[];self.reads=[];self.mode=None;self.closed=False
        b=self.base
        self.put(b,b'MZ');self.u32(b+0x3c,0x158);self.put(b+0x158,b'PE\0\0');self.u32(b+0x160,0x6ad5e20c);self.u32(b+0x1a8,0x61da000)
        self.put(b+0xe764c9,bytes.fromhex('41 8b 40 18 49 8b e8 48 8b fa 4c 8b f1 39 41 18'))
        self.put(b+0xc922e9,bytes.fromhex('48 81 c1 60 01 00 00'))
        self.app=0x200000;holder=0x210000;interface=0x220000;context=0x230000;self.window=0x240000;self.db=0x250000;self.array=0x260000
        for a,p in [(b+0x5ccd808,self.app),(b+0x5c7f4b8,holder),(holder+0x10,interface),(interface+0x88,context),(context+0xd8,self.window),(b+0x5c7c4f0,self.db),(self.db+0x20,self.array)]:self.u64(a,p)
        self.u32(self.app+0x1c8,4);self.u32(self.db+0x2c,20)
        self.rtti(interface,0x300000,0x310000,0x5000,'.?AVCIngameInterfaceIdlerGfx@@')
        self.rtti(self.window,0x320000,0x330000,0x6000,'.?AVCCharacterWindow@@')
        self.ch=0x400000;self.data=0x500000;self.original=bytes(range(16))*26
        self.make_char(1,self.ch,self.data,'Synthetic Hero',self.original)
        self.make_char(2,0x410000,0x510000,'Other',bytes(v^3 for v in self.original))
        self.select(1);self.after_dna_read=None
    def put(self,a,data):
        self.cells.update({a+i:v for i,v in enumerate(data)})
    def u32(self,a,x):self.put(a,struct.pack('<I',x))
    def u64(self,a,x):self.put(a,struct.pack('<Q',x))
    def rtti(self,obj,vt,col,rva,name):
        self.u64(obj,vt);self.u64(vt-8,col);self.u32(col+12,rva);self.put(self.base+rva+16,name.encode().ljust(128,b'\0'))
    def make_char(self,cid,ch,data,name,raw):
        self.u64(self.array+cid*16+8,ch);self.put(ch,bytes(0x190));self.u32(ch+0x18,cid);self.u32(ch+0x1c,0x43686172)
        self.put(ch+0x20,name.encode());self.u64(ch+0x30,len(name));self.u64(ch+0x38,15)
        self.u64(ch+0x160,data);self.u32(ch+0x168,len(raw)//4+20);self.u32(ch+0x16c,len(raw)//4);self.u32(ch+0x178,live.murmur3(raw));self.u64(ch+0x180,99);self.put(data,raw)
    def select(self,cid):self.u32(self.window+0xc8,cid)
    def read(self,a,n):
        self.reads.append((a,n))
        try:result=bytes(self.cells[a+i] for i in range(n))
        except KeyError:raise live.LiveGameError('mock read failure','read_failed')
        if a==self.data and self.after_dna_read:
            callback=self.after_dna_read;self.after_dna_read=None;callback()
        return result
    def write(self,a,data):
        self.writes.append((a,data));first=len(self.writes)==1
        if first and self.mode=='partial':self.put(a,data[:7]);return 7
        if a==self.ch+0x178 and self.mode=='hash_fail' and len(self.writes)==2:return 0
        self.put(a,data)
        if first and self.mode=='switch_after_write':self.select(2)
        if first and self.mode=='reallocate':self.u64(self.ch+0x160,self.data+0x10000)
        if first and self.mode=='readback_failure':self.cells.pop(self.app+0x1c8)
        return len(data)
    def __enter__(self):return self
    def __exit__(self,*_):self.closed=True

class Tests(unittest.TestCase):
    def world(self):
        m=Memory();g=live.LiveGame(m);self.target=g.status();return m,g
    def expected(self):return {k:self.target[k] for k in ('pid','id','selectionToken')}
    def changed(self,m):return base64.b64encode(bytes(v^1 for v in m.original)).decode()
    def test_build_guard(self):
        m,g=self.world();g.verify_build();m.u32(m.base+0x160,0)
        with self.assertRaisesRegex(live.LiveGameError,'nicht geprüft'):g.verify_build()
        self.assertEqual(m.writes,[])
    def test_status_follows_selection_no_dna_reads(self):
        m,g=self.world();s=g.status();self.assertEqual((s['name'],s['id'],s['geneCount']),('Synthetic Hero',1,104))
        m.select(2);self.assertEqual(g.status()['name'],'Other')
        self.assertFalse(any(a in (m.data,0x510000) for a,n in m.reads));self.assertEqual(m.writes,[])
        self.assertEqual(set(vars(g)),{'memory','base'})
    def test_copy_exact_and_no_retention(self):
        m,g=self.world();s=g.copy(self.expected());self.assertEqual(base64.b64decode(s['dna']),m.original)
        self.assertEqual(set(vars(g)),{'memory','base'});self.assertEqual(m.writes,[])
    def test_stale_or_missing_expected_target_blocks_paste(self):
        for expected in [None,{}, {'pid':42,'id':1}, {'pid':42,'id':2},{'pid':43,'id':1},{'pid':True,'id':1},
                         {'pid':42,'id':1,'selectionToken':'0'*64}, {'pid':42,'id':1,'selectionToken':123}]:
            m,g=self.world()
            with self.subTest(expected=expected):
                with self.assertRaises(live.LiveGameError):g.paste(self.changed(m),expected)
                self.assertEqual(m.writes,[])
    def test_reused_pid_and_character_id_reject_old_object_identity(self):
        m,g=self.world();expected=self.expected()
        m.make_char(1,0x420000,0x520000,'Replacement',m.original)
        self.assertEqual((g.status()['pid'],g.status()['id']),(expected['pid'],expected['id']))
        self.assertNotEqual(g.status()['selectionToken'],expected['selectionToken'])
        with self.assertRaisesRegex(live.LiveGameError,'geändert'):g.paste(self.changed(m),expected)
        self.assertEqual(m.writes,[])
    def test_each_identity_field_invalidates_selection_token(self):
        for offset,value,bits in [(0x160,0x520000,64),(0x168,125,32),(0x16c,103,32),(0x180,100,64)]:
            m,g=self.world();expected=self.expected()
            (m.u64 if bits==64 else m.u32)(m.ch+offset,value)
            with self.subTest(offset=offset):
                self.assertNotEqual(g.status()['selectionToken'],expected['selectionToken'])
                with self.assertRaises(live.LiveGameError):g.check_expected(g.selected(),expected)
                self.assertEqual(m.writes,[])
    def test_backend_restart_invalidates_token_without_disclosing_identity(self):
        m,g=self.world();expected=self.expected()
        self.assertRegex(expected['selectionToken'],r'^[0-9a-f]{64}$')
        with patch.object(live,'_SELECTION_SECRET',b'other_backend_secret'):
            with self.assertRaises(live.LiveGameError):g.paste(self.changed(m),expected)
        self.assertEqual(m.writes,[])
    def test_paste_success_and_no_session_backup(self):
        m,g=self.world();new=self.changed(m);s=g.paste(new,self.expected());self.assertTrue(s['changed'])
        self.assertEqual(m.read(m.data,len(m.original)),base64.b64decode(new))
        self.assertEqual(g.u32(m.ch+0x178),live.murmur3(base64.b64decode(new)))
        self.assertEqual([a for a,d in m.writes],[m.data,m.ch+0x178])
        self.assertEqual(set(vars(g)),{'memory','base'})
        self.assertEqual(s['selectionToken'],self.expected()['selectionToken'])
        self.assertEqual(g.status()['selectionToken'],s['selectionToken'])
        self.assertTrue(g.paste(base64.b64encode(m.original).decode(),self.expected())['changed'])
    def test_expired_deadline_has_zero_writes(self):
        m,g=self.world()
        with self.assertRaisesRegex(live.LiveGameError,'Zeitlimit abgelaufen'):
            g.paste(self.changed(m),self.expected(),time.time()*1000-1)
        self.assertEqual(m.writes,[])
        self.assertEqual(m.read(m.data,len(m.original)),m.original)
    def test_positive_deadline_allows_complete_transaction(self):
        m,g=self.world()
        result=g.paste(self.changed(m),self.expected(),time.time()*1000+10000)
        self.assertTrue(result['changed'])
        self.assertEqual(len(m.writes),2)
    def test_noop_and_length_mismatch(self):
        m,g=self.world();s=g.paste(base64.b64encode(m.original).decode(),self.expected());self.assertFalse(s['changed'])
        with self.assertRaisesRegex(live.LiveGameError,'Länge'):g.paste(base64.b64encode(m.original[:-4]).decode(),self.expected())
        self.assertEqual(m.writes,[])
    def test_switch_before_write_blocks(self):
        m,g=self.world();m.after_dna_read=lambda:m.select(2)
        with self.assertRaisesRegex(live.LiveGameError,'geändert'):g.paste(self.changed(m),self.expected())
        self.assertEqual(m.writes,[])
    def test_failed_write_rolls_back(self):
        for mode in ['partial','hash_fail','switch_after_write','readback_failure']:
            m,g=self.world();m.mode=mode
            with self.subTest(mode=mode):
                with self.assertRaisesRegex(live.LiveGameError,'ursprüngliche DNA wurde wiederhergestellt'):g.paste(self.changed(m),self.expected())
                self.assertEqual(m.read(m.data,len(m.original)),m.original)
                self.assertEqual(g.u32(m.ch+0x178),live.murmur3(m.original))
    def test_reallocated_target_not_restored(self):
        m,g=self.world();m.mode='reallocate'
        with self.assertRaisesRegex(live.LiveGameError,'NICHT speichern'):g.paste(self.changed(m),self.expected())
        self.assertEqual(len(m.writes),2)
    def test_bad_hash_and_layout_blocks(self):
        for addr,value in [(0x178,0),(0x168,0),(0x16c,0)]:
            m,g=self.world();m.u32(m.ch+addr,value)
            with self.subTest(addr=addr):
                with self.assertRaises(live.LiveGameError):g.copy()
                self.assertEqual(m.writes,[])
    def test_closed_or_invalid_selection(self):
        for addr,val in [(0x1c8,1)]:
            m,g=self.world();m.u32(m.app+addr,val)
            with self.assertRaises(live.LiveGameError):g.status()
        m,g=self.world();m.select(0xffffffff)
        with self.assertRaises(live.LiveGameError):g.status()
        m,g=self.world();m.cells.pop(m.ch+0x18)
        with self.assertRaises(live.LiveGameError):g.status()
    def test_decode_strict(self):
        for value in ['',None,'A','AAA','AA=A','AB==','AAB=','AAAA=AAA','====','genes={}',base64.b64encode(b'abc').decode()]:
            with self.subTest(value=value):
                with self.assertRaises(live.LiveGameError):live.decode_dna(value)
        self.assertEqual(live.decode_dna(' " AQID\nBA== " '),bytes([1,2,3,4]))
    def test_handle_routes_and_soft_status_errors(self):
        m,g=self.world()
        with patch.object(live,'WindowsMemory',return_value=m) as factory:
            s=live.handle_live('game_status');self.assertTrue(s['ready']);factory.assert_called_once_with(writable=False)
        self.assertTrue(m.closed)
        with patch.object(live,'WindowsMemory',side_effect=live.LiveGameError('not running','not_running')):
            self.assertEqual(live.handle_live('game_status')['errorCode'],'not_running')
            with self.assertRaises(live.LiveGameError):live.handle_live('game_copy')
    def test_saved_live_hash(self):
        raw=Path(__file__).resolve().parents[1]/'fixtures/live_dna.bin'
        self.assertEqual(live.murmur3(raw.read_bytes()),0xda9beb08)
        self.assertEqual(live.murmur3(b''),0)
        self.assertEqual(live.murmur3(b'foo'),0xf6a5c420)
        self.assertEqual(live.murmur3(b'hello'),0x248bfa47)

if __name__=='__main__':unittest.main(verbosity=2)
