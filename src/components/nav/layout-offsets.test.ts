import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const read=(p:string)=>readFileSync(p,'utf8');
it('keeps the phone tab bar below the shared source drawer',()=>{
 const tabBar=read('src/components/TabBar.tsx');
 const drawer=read('src/components/research-ui/source-drawer/SourceDrawer.tsx');
 const tabClasses=tabBar.match(/<nav\b[^>]*className="([^"]*)"/)![1].split(/\s+/);
 const drawerClasses=drawer.match(/return <div className="([^"]*)"/)![1].split(/\s+/);
 expect(tabClasses.filter(c=>c.startsWith('z-'))).toEqual(['z-40']);
 expect(drawerClasses.filter(c=>c.startsWith('z-'))).toEqual(['z-[60]']);
});
it('resets desktop body clearance and keeps mobile clearance',()=>{const css=read('src/app/globals.css');expect(css).toMatch(/padding-bottom: 60px/);expect(css).toMatch(/@media\s*\(min-width: 1024px\)\s*{\s*body\s*{\s*padding-bottom: 0/);});
it.each(['CopilotFab','Toast'])('%s clears the phone bar only',name=>expect(read(`src/components/${name}.tsx`)).toContain('bottom-20 lg:bottom-6'));
it('sidebar uses the measured top bar height',()=>expect(read('src/components/WatchlistSidebar.tsx')).toContain('top-[var(--app-topbar-height,48px)]'));
