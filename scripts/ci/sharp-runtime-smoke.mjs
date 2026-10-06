// Decode and resize only in-memory synthetic images with the sharp copy resolved by Next.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const sharp = createRequire(createRequire(process.cwd()+'/package.json').resolve('next/package.json'))('sharp');
(async()=>{
 assert.equal(sharp.versions.sharp,'0.35.5');
 assert.equal(sharp.versions.rsvg,'2.63.2');
 console.log(JSON.stringify({platform:process.platform,arch:process.arch,scope:'Next-resolved native runtime; not deployed artifact'}));
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12"><rect width="16" height="12" fill="#123456"/></svg>');
 const png=await sharp(svg).resize(8,6).png().toBuffer();
 const meta=await sharp(png).metadata(); assert.equal(meta.width,8);assert.equal(meta.height,6);assert.equal(meta.format,'png');
 const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.channels,3);assert.deepEqual([...data.subarray(0,3)],[18,52,86]);
 console.log(JSON.stringify({sharp:sharp.versions.sharp,rsvg:sharp.versions.rsvg,png:{width:meta.width,height:meta.height},syntheticOnly:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
