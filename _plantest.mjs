import { buildExportPlan } from './public/js/ffmpeg.js';
import { writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const clip = {
  start: 5, end: 25, duration: 30,
  captions: [
    { t0: 0, t1: 4, text: 'Hello world, this is a test clip' },
    { t0: 4, t1: 9, text: 'ทดสอบซับไทยกับอังกฤษผสมกัน' },
    { t0: 9, t1: 14, text: 'viral moment ตอนนี้แหละ' },
  ],
  style: { color: '#ffffff', bg: 'rgba(0,0,0,0.55)', animation: 'pop', position: 'bottom', size: 46 },
};
const plan = buildExportPlan({ clip, aspect: '9:16', quality: '1080', watermark: '@ai_clip', musicId: 'lofi', musicVolume: 0.25, fileName: 'x.mp4' });
console.log('ARGS:', JSON.stringify(plan.args, null, 1));
mkdirSync('/tmp/plan/run', { recursive: true });
copyFileSync('/tmp/fftest/in.mp4', '/tmp/plan/run/in.mp4');
copyFileSync('/home/user/Ai/public/vendor/fonts/NotoSansThai-Bold.ttf', '/tmp/plan/run/font.ttf');
for (const f of plan.files) if (f.text) writeFileSync(`/tmp/plan/run/${f.name}`, f.text);
copyFileSync('/tmp/fftest/music_lofi.wav', '/tmp/plan/run/music.wav');
const args = plan.args.map(a => a === 'INPUT' ? 'in.mp4' : a);
const FF = execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
execFileSync(FF, args, { cwd: '/tmp/plan/run', stdio: 'inherit' });
console.log('EXPORT_OK');
