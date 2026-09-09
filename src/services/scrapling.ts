import { spawn } from "child_process";
import path from "path";

export async function runScrapling(action: string, payload: any): Promise<any> {
  const pythonBin = process.env.PYTHON_BIN || `${process.cwd()}/.venv/bin/python3`;
  const scriptPath = `${process.cwd()}/scrapers/scrapling_scrapers.py`;
  const input = JSON.stringify({ action, payload });

  return new Promise((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ pythonBin, [scriptPath]);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Scrapling failed with code ${code}: ${stderr}`));
      }
      try {
        // Python logging might output to stdout if logging isn't silenced.
        // We should extract the last line or parse carefully. 
        // Let's parse line by line from the end to find a valid JSON object.
        const lines = stdout.trim().split("\n");
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const data = JSON.parse(lines[i]);
            return resolve(data);
          } catch (e) {
            continue;
          }
        }
        reject(new Error("No valid JSON found in stdout: " + stdout));
      } catch (err) {
        reject(err);
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}
