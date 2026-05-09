import { describe, expect, test } from 'bun:test';
import { runCli } from '../helpers/test-kit-utils';

describe('manic CLI smoke', () => {
  test('prints general help', async () => {
    const result = await runCli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('Commands:');
  });

  test('prints command help', async () => {
    const result = await runCli(['help', 'dev']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('manic dev');
  });

  test('prints semantic version', async () => {
    const result = await runCli(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
  });
});
