const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.join(__dirname, '..');
for (const name of ['core.js','game.js']) execFileSync(process.execPath,['--check',path.join(root,'dist',name)]);
const entries = fs.readdirSync(path.join(root,'dist')).sort();
if(!entries.includes('index.html')) throw new Error('Missing root entrypoint');
const hashes = Object.fromEntries(entries.map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(root,'dist',name))).digest('hex')]));
fs.mkdirSync(path.join(root,'release'),{recursive:true});
fs.writeFileSync(path.join(root,'release','SHA256SUMS.txt'),Object.entries(hashes).map(([name,hash])=>`${hash}  ${name}`).join('\n')+'\n');
execFileSync('python3',['-c',`import zipfile,pathlib
root=pathlib.Path(${JSON.stringify(root)})
with zipfile.ZipFile(root/'release/slipshift-html5.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted((root/'dist').iterdir()):
  info=zipfile.ZipInfo(p.name,date_time=(2026,10,29,15,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
  z.writestr(info,p.read_bytes())
`]);
console.log(JSON.stringify({files:entries,sha256:hashes,package:'release/slipshift-html5.zip'},null,2));
