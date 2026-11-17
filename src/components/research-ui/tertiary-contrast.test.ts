import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const dark=readFileSync('src/app/globals.css','utf8').split(':root.theme-dark')[1].split('}')[0];
function luminance(hex:string) {
 const rgb=hex.match(/\w\w/g)!.map(c=>parseInt(c,16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
 return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
}
const token=(name:string)=>new RegExp('--'+name+':\\s*#([0-9a-f]{6})').exec(dark)![1];
it.each(['bg','bg-elevated','bg-card','bg-hover'])('tertiary text meets 4.5:1 on %s',name=>{
 const a=luminance(token('text-muted')),b=luminance(token(name));
 expect((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toBeGreaterThanOrEqual(4.5);
});
it('documents the approved Distant Fog token',()=>{
 expect(dark).toContain('#8b8b94');
 const design=readFileSync('DESIGN.md','utf8');
 expect(design).toContain('#8b8b94');
 expect(design).not.toMatch(/Distant Fog[^\n]*#52525b/);
});
