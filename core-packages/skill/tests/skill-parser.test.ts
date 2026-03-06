import { describe, it, expect } from 'vitest';
import { parseSkillMd, SkillParseError } from '../src/skill-parser.js';

const VALID_FULL_SKILL = `# code-review

## Description
코드 리뷰를 수행합니다.

## Tools
- file_read
- file_search

## Prompt
당신은 시니어 코드 리뷰어입니다.
보안 취약점, 네이밍 일관성, 에러 핸들링을 중점으로 검토합니다.

## Rules
- no-file-write
- require-explanation

## Parameters
- severity_threshold: warning
- max_files: 10
`;

describe('parseSkillMd', () => {
  it('should parse a complete skill markdown correctly', () => {
    const skill = parseSkillMd(VALID_FULL_SKILL);

    expect(skill.name).toBe('code-review');
    expect(skill.description).toBe('코드 리뷰를 수행합니다.');
    expect(skill.tools).toEqual(['file_read', 'file_search']);
    expect(skill.prompt).toContain('시니어 코드 리뷰어');
    expect(skill.prompt).toContain('보안 취약점');
    expect(skill.rules).toEqual(['no-file-write', 'require-explanation']);
    expect(skill.parameters).toEqual({
      severity_threshold: 'warning',
      max_files: '10',
    });
  });

  it('should parse a skill with only Tools section (no Prompt)', () => {
    const md = `# minimal-tools

## Tools
- grep
- ls
`;
    const skill = parseSkillMd(md);

    expect(skill.name).toBe('minimal-tools');
    expect(skill.tools).toEqual(['grep', 'ls']);
    expect(skill.prompt).toBe('');
    expect(skill.description).toBe('');
    expect(skill.rules).toEqual([]);
    expect(skill.parameters).toEqual({});
  });

  it('should parse a skill with only Prompt section (no Tools)', () => {
    const md = `# prompt-only

## Prompt
You are a helpful assistant.
`;
    const skill = parseSkillMd(md);

    expect(skill.name).toBe('prompt-only');
    expect(skill.prompt).toBe('You are a helpful assistant.');
    expect(skill.tools).toEqual([]);
  });

  it('should throw SkillParseError for empty content', () => {
    expect(() => parseSkillMd('')).toThrow(SkillParseError);
    expect(() => parseSkillMd('   ')).toThrow(SkillParseError);
  });

  it('should throw SkillParseError when H1 name header is missing', () => {
    const md = `## Tools
- file_read

## Prompt
Some prompt.
`;
    expect(() => parseSkillMd(md)).toThrow(SkillParseError);
    expect(() => parseSkillMd(md)).toThrow('Missing skill name');
  });

  it('should throw SkillParseError when neither Tools nor Prompt is present', () => {
    const md = `# orphan-skill

## Description
Has no tools or prompt.
`;
    expect(() => parseSkillMd(md)).toThrow(SkillParseError);
    expect(() => parseSkillMd(md)).toThrow('must have at least');
  });

  it('should handle multi-line prompt content correctly', () => {
    const md = `# multi-line

## Prompt
Line one.
Line two.

Line four after blank.
`;
    const skill = parseSkillMd(md);

    expect(skill.prompt).toContain('Line one.');
    expect(skill.prompt).toContain('Line two.');
    expect(skill.prompt).toContain('Line four after blank.');
  });

  it('should handle parameters with colons in the value', () => {
    const md = `# param-test

## Tools
- tool_a

## Parameters
- url: https://example.com:8080/api
- mode: strict
`;
    const skill = parseSkillMd(md);

    expect(skill.parameters).toEqual({
      url: 'https://example.com:8080/api',
      mode: 'strict',
    });
  });

  it('should trim whitespace from name and section values', () => {
    const md = `#   spaced-name

## Description
  description with leading space

## Tools
-   tool_one
- tool_two

## Rules
-  rule_a
`;
    const skill = parseSkillMd(md);

    expect(skill.name).toBe('spaced-name');
    expect(skill.tools).toEqual(['tool_one', 'tool_two']);
    expect(skill.rules).toEqual(['rule_a']);
  });

  it('should handle sections in any order', () => {
    const md = `# reordered

## Rules
- rule-x

## Prompt
A prompt here.

## Tools
- my-tool

## Description
Described last.
`;
    const skill = parseSkillMd(md);

    expect(skill.name).toBe('reordered');
    expect(skill.rules).toEqual(['rule-x']);
    expect(skill.prompt).toBe('A prompt here.');
    expect(skill.tools).toEqual(['my-tool']);
    expect(skill.description).toBe('Described last.');
  });
});
