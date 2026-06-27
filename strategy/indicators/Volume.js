export class VolumeIndicator {
  static calculate(volumes, period = 20) {
    const s = volumes.slice(-period);
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    const cur = volumes[volumes.length-1];
    return { average: avg, current: cur, ratio: cur / avg };
  }
  static interpret(r) { if (r >= 2) return 'very_high'; if (r >= 1.5) return 'high'; if (r >= 0.8) return 'normal'; return 'low'; }
}
