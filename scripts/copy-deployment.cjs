const fs=require('node:fs');
if(fs.existsSync('frontend/deployment.json')){
  fs.mkdirSync('dist/frontend',{recursive:true});
  fs.copyFileSync('frontend/deployment.json','dist/frontend/deployment.json');
} else console.warn('No Ganache deployment yet. Build renders, but run npm run deploy and rebuild before connecting.');
