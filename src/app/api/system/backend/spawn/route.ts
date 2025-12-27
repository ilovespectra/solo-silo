import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const { spawn, exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      await execAsync('pkill -f "python.*uvicorn.*8000"');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
    }

    const scriptPath = '/Users/tanny/Documents/github/dudlefotos/START_BACKEND.sh';
    const child = spawn('bash', [scriptPath], {
      detached: true,
      stdio: 'ignore',
      cwd: '/Users/tanny/Documents/github/dudlefotos',
    });
    child.unref();
    return NextResponse.json({ spawned: true, message: 'Backend stopped and restarted' });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
