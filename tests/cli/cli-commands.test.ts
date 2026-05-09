import { describe, expect, test } from 'bun:test';
import { runCli } from '../helpers/test-kit-utils';

const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, '');

describe('manic CLI smoke', () => {
  test('prints general help', async () => {
    const result = await runCli(['--help']);
    const output = stripAnsi(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(output).toContain('Usage:');
    expect(output).toContain('Commands:');
  });

  test('prints command help', async () => {
    const result = await runCli(['help', 'dev']);
    const output = stripAnsi(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(output).toContain('manic dev');
  });

  test('prints semantic version', async () => {
    const result = await runCli(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
  });
});
