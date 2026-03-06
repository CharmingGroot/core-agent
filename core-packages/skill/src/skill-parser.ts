import type { ISkill } from '@core/types';

/** Regex to split markdown content by ## headers */
const SECTION_HEADER_REGEX = /^##\s+(.+)$/gm;

/** Regex to match H1 header for the skill name */
const NAME_HEADER_REGEX = /^#\s+(.+)$/m;

/** Regex to match list items ("- item") */
const LIST_ITEM_REGEX = /^-\s+(.+)$/gm;

/** Regex to match key-value list items ("- key: value") */
const KV_ITEM_REGEX = /^-\s+([^:]+):\s*(.+)$/;

/**
 * Sections extracted from a .skill.md file.
 * Keys are lowercased section header names.
 */
interface ParsedSections {
  readonly [header: string]: string;
}

/**
 * Splits a markdown string into named sections based on ## headers.
 * Returns a map from lowercased header name to section body text.
 */
function extractSections(content: string): { name: string; sections: ParsedSections } {
  const nameMatch = NAME_HEADER_REGEX.exec(content);
  if (!nameMatch) {
    throw new SkillParseError('Missing skill name: expected an H1 header (# skill-name)');
  }

  const name = nameMatch[1].trim();
  const sections: Record<string, string> = {};

  // Find all ## headers and their positions
  const headers: Array<{ key: string; index: number; end: number }> = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(SECTION_HEADER_REGEX.source, 'gm');

  while ((match = regex.exec(content)) !== null) {
    headers.push({
      key: match[1].trim().toLowerCase(),
      index: match.index,
      end: match.index + match[0].length,
    });
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const nextStart = i + 1 < headers.length ? headers[i + 1].index : content.length;
    const body = content.slice(header.end, nextStart).trim();
    sections[header.key] = body;
  }

  return { name, sections };
}

/**
 * Parses list items from a section body.
 * Matches lines starting with "- ".
 */
function parseListItems(body: string): string[] {
  const items: string[] = [];
  const regex = new RegExp(LIST_ITEM_REGEX.source, 'gm');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    items.push(match[1].trim());
  }

  return items;
}

/**
 * Parses key-value list items from a section body.
 * Matches lines like "- key: value".
 */
function parseKeyValueItems(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = body.split('\n');

  for (const line of lines) {
    const match = KV_ITEM_REGEX.exec(line.trim());
    if (match) {
      result[match[1].trim()] = match[2].trim();
    }
  }

  return result;
}

/**
 * Custom error for skill parsing failures.
 */
export class SkillParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillParseError';
  }
}

/**
 * Parses a .skill.md markdown string into an ISkill object.
 *
 * Required: H1 name header, and at least one of ## Tools or ## Prompt.
 * Optional: ## Description, ## Rules, ## Parameters.
 *
 * @throws {SkillParseError} on missing required sections or invalid format
 */
export function parseSkillMd(content: string): ISkill {
  if (!content || !content.trim()) {
    throw new SkillParseError('Skill markdown content is empty');
  }

  const { name, sections } = extractSections(content);

  const hasTools = 'tools' in sections;
  const hasPrompt = 'prompt' in sections;

  if (!hasTools && !hasPrompt) {
    throw new SkillParseError(
      `Skill "${name}" must have at least a ## Tools or ## Prompt section`
    );
  }

  const description = sections['description'] ?? '';
  const tools = hasTools ? parseListItems(sections['tools']) : [];
  const prompt = sections['prompt'] ?? '';
  const rules = 'rules' in sections ? parseListItems(sections['rules']) : [];
  const parameters: Record<string, string> =
    'parameters' in sections ? parseKeyValueItems(sections['parameters']) : {};

  return {
    name,
    description,
    tools,
    prompt,
    rules,
    parameters,
  };
}
