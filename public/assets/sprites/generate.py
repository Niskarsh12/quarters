"""Original Dungeon Stake sprites, adapting the installed skill's native Walker kit."""
import sys, json, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
SKILL = ROOT / '.claude/skills/sprite/scripts'
sys.path.insert(0, str(SKILL))
from kit import Walker, Canvas

RAMPS = {
 'skin':['#f8d8a0','#dca56e','#a46a48','#47312f'],
 'hair':['#dca56e','#a46a48','#714534','#33262c'],
 'tunic':['#f6cc72','#d99a42','#986035','#47312f'],
 'sleeve':['#f6cc72','#d99a42','#986035','#47312f'],
 'pants':['#899493','#59666a','#38434b','#202633'],
 'pants_back':['#899493','#59666a','#38434b','#202633'],
 'boot':['#a46a48','#714534','#47312f','#202633'],
 'belt':['#ffe4a0','#f6cc72','#d99a42','#47312f'],
 'cape':['#a9c879','#6c9554','#41684c','#243b3b'],
 'eye':['#202633']*4, 'white':['#fff1c1']*4,
 'metal':['#e0e6d4','#a9bdbe','#697f91','#303e58'],
 'magic':['#d4b5ea','#a582c5','#70518f','#382e50'],
 'red':['#f4aa7a','#d96659','#94434b','#462c40'],
 'green':['#c6d98b','#8bac65','#58784e','#2e4941'],
}
OUT=Path(__file__).parent
def props(c, role):
 if role=='knight':
  c.rect(8,5,16,8,'metal'); c.rect(10,12,12,3,'eye'); c.rect(15,10,2,7,'metal')
  c.rect(26,8,2,17,'metal'); c.rect(23,23,7,2,'belt'); c.rect(26,25,2,4,'boot')
  c.rect(3,18,7,9,'metal'); c.rect(6,19,2,7,'tunic')
 elif role=='archer':
  for y,x in [(8,26),(10,28),(13,29),(16,30),(19,29),(22,28),(24,26)]: c.rect(x,y,2,3,'boot')
  c.rect(25,9,1,17,'belt'); c.rect(22,16,8,1,'metal'); c.rect(7,5,15,4,'green')
 elif role in ('mage','dark-mage'):
  for y in range(2,10): c.rect(16-(y-2)//2,y,3+(y-2),1,'magic')
  c.rect(6,10,20,2,'magic'); c.rect(26,9,2,20,'boot'); c.ellipse(27,7,3,3,'magic' if role=='mage' else 'red')
 elif role=='barbarian':
  c.rect(7,6,18,3,'boot'); c.rect(5,3,3,6,'metal'); c.rect(24,3,3,6,'metal')
  c.rect(26,8,2,21,'boot'); c.rect(22,8,8,7,'metal'); c.rect(20,10,3,5,'metal')
 elif role=='rogue':
  c.rect(7,5,18,6,'magic'); c.rect(8,14,16,4,'magic'); c.rect(27,19,2,7,'metal'); c.rect(25,25,5,2,'belt')
 elif role=='orc':
  c.rect(6,15,3,5,'white'); c.rect(23,15,3,5,'white'); c.rect(26,11,3,18,'boot'); c.rect(24,8,6,7,'metal')
 elif role=='goblin':
  c.rect(3,9,6,4,'green'); c.rect(23,9,6,4,'green'); c.rect(26,21,2,6,'metal'); c.rect(25,26,4,2,'boot')
 elif role=='skeleton':
  c.rect(10,9,4,4,'eye'); c.rect(19,9,4,4,'eye'); c.rect(15,14,2,2,'eye')
  for y in (18,21): c.rect(12,y,9,1,'white')
  c.rect(16,17,1,9,'white'); c.rect(27,10,1,18,'metal')

def save(name, spec):
 dest=OUT/name; dest.mkdir(exist_ok=True)
 path=dest/'spec.json'; path.write_text(json.dumps(spec))
 subprocess.run([sys.executable,str(SKILL/'backends.py'),str(path),'--backend','native','--out',str(dest),'--scale','6'],check=True)
 subprocess.run([sys.executable,str(SKILL/'gallery.py'),str(dest)],check=True)

names=['knight','archer','mage','barbarian','rogue','boss','orc','goblin','skeleton','dark-mage']
for name in names:
 ramps=dict(RAMPS)
 if name in ('archer','goblin','orc'): ramps['tunic']=ramps['green']; ramps['sleeve']=ramps['green']
 if name in ('mage','dark-mage','rogue'): ramps['tunic']=ramps['magic']; ramps['sleeve']=ramps['magic']; ramps['cape']=ramps['magic']
 if name in ('orc','goblin'): ramps['skin']=ramps['green']
 if name=='skeleton': ramps['skin']=ramps['metal']; ramps['tunic']=ramps['pants']; ramps['sleeve']=ramps['metal']
 if name=='knight': ramps['tunic']=ramps['metal']; ramps['sleeve']=ramps['metal']
 if name=='barbarian': ramps['tunic']=ramps['skin']; ramps['sleeve']=ramps['skin']
 w=Walker(size=32,ramps=ramps,hair='bald' if name in ('skeleton','orc') else 'short')
 palette, chars=w._chars()
 c=w.materials('down',0); props(c,name)
 if name=='boss':
  c=Canvas(48)
  for y in range(12,32):
   width=max(2,14-(y-12)//2); c.rect(2,y,width,1,'red'); c.rect(46-width,y,width,1,'red')
  c.ellipse(24,29,12,13,'red'); c.ellipse(24,16,10,9,'red')
  c.rect(14,4,4,11,'belt'); c.rect(30,4,4,11,'belt'); c.rect(12,3,4,4,'belt'); c.rect(32,3,4,4,'belt')
  c.rect(17,16,5,2,'belt'); c.rect(27,16,5,2,'belt'); c.rect(20,23,8,2,'eye')
  c.rect(17,37,5,7,'red'); c.rect(28,37,5,7,'red'); c.rect(15,42,8,3,'metal'); c.rect(28,42,8,3,'metal')
 save(name,{'palette':palette,'frames':{name:c.shade(chars)},'animations':{},'sheet':{'columns':1}})

for name in ('grass-path','dark-stone-floor'):
 pal={'a':'#324d39','b':'#476443','c':'#759051','d':'#8b7952','e':'#a58f60'} if name=='grass-path' else {'a':'#262632','b':'#3b3b49','c':'#484855','d':'#31313f','e':'#51515d'}
 rows=[]
 for y in range(16):
  row=''
  for x in range(16):
   if name=='grass-path': color='d' if 4<=y<=11 else 'b'; color='e' if 4<=y<=11 and (x*3+y*7)%19==0 else color; color='c' if y not in range(4,12) and (x*7+y*5)%13==0 else color
   else: color='a' if y%8==0 or (x+(8 if y>=8 else 0))%16==0 else ('c' if y%8==1 else 'b'); color='d' if (x*7+y*3)%23==0 else color
   row+=color
  rows.append(row)
 save(name,{'palette':pal,'frames':{name:rows},'animations':{},'sheet':{'columns':1}})
index='<h1>Dungeon Stake — native sprite gallery</h1><style>body{background:#202633;color:#fff1c1;font:16px sans-serif}section{display:inline-block;padding:20px}img{image-rendering:pixelated;width:160px}</style>'
for name in names+['grass-path','dark-stone-floor']: index+=f'<section><h2>{name}</h2><img src="{name}/sheet.png"></section>'
(OUT/'index.html').write_text(index)
