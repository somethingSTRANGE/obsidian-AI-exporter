/**
 * HTML to Markdown conversion — barrel re-export + orchestrator
 *
 * Internal modules:
 * - markdown-rules.ts      — Turndown engine (leaf, no internal deps)
 * - markdown-deep-research.ts — Citation → footnote pipeline
 * - markdown-formatting.ts — Message formatting templates
 */

import { formatMessage, formatToolContent } from './markdown-formatting';
import { convertDeepResearchContent } from './markdown-deep-research';
import { generateHash } from '../lib/hash';
import { MAX_FILENAME_LENGTH, FILENAME_ID_SUFFIX_LENGTH } from '../lib/constants';
import type {
  ConversationData,
  ObsidianNote,
  NoteFrontmatter,
  TemplateOptions,
} from '../lib/types';
import { formatDateWithTimezone } from '../lib/date-utils';

// Re-exports (preserve existing import paths)
export { htmlToMarkdown, escapeAngleBrackets } from './markdown-rules';
export { convertDeepResearchContent } from './markdown-deep-research';

/**
 * Generate filename from title.
 * Preserves original casing; replaces only Windows-invalid characters with '_'.
 * Appends an 8-char ID suffix in brackets for uniqueness, e.g.:
 *   "Gemini App Conversation Limitations [df678ce8].md"
 */
export function generateFileName(title: string, conversationId: string): string {
  // "YYYY-MM-DD - " (13) + " [" (2) + id + "]" (1) + ".md" (3) = 19
  const maxTitleLength = MAX_FILENAME_LENGTH - FILENAME_ID_SUFFIX_LENGTH - 19;
  const sanitized = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .substring(0, maxTitleLength);

  const idSuffix = conversationId.substring(0, FILENAME_ID_SUFFIX_LENGTH);
  return `${sanitized || 'conversation'} [${idSuffix}].md`;
}

/**
 * Generate content hash for deduplication
 */
export function generateContentHash(content: string): string {
  return generateHash(content);
}

/**
 * Convert conversation data to Obsidian note
 */
export function conversationToNote(data: ConversationData, options: TemplateOptions): ObsidianNote {
  const timezone = options.timezone ?? 'UTC';
  const now = formatDateWithTimezone(new Date(), timezone);

  // Generate frontmatter
  const frontmatter: NoteFrontmatter = {
    id: `${data.source}_${data.id}`,
    title: data.title,
    source: data.source,
    ...(data.type && { type: data.type }),
    url: data.url,
    created: formatDateWithTimezone(data.extractedAt, timezone),
    modified: now,
    tags:
      data.type === 'deep-research'
        ? ['ai-research', 'deep-research', data.source]
        : ['ai-conversation', data.source],
    message_count: data.messages.length,
  };

  // Generate body - different format for Deep Research vs normal conversation
  let body: string;

  if (data.type === 'deep-research') {
    // Deep Research: convert with links support (footnotes + References)
    if (data.messages.length === 0) {
      body = '';
    } else {
      body = convertDeepResearchContent(data.messages[0].content, data.links);
    }
  } else {
    // Normal conversation format (callout style)
    const bodyParts: string[] = [];

    for (const message of data.messages) {
      // Render tool content as separate collapsible callout before assistant message
      if (message.toolContent) {
        bodyParts.push(formatToolContent(message.toolContent, options));
      }
      const formatted = formatMessage(message.content, message.role, options, data.source);
      bodyParts.push(formatted);
    }

    body = bodyParts.join('\n\n');
  }

  // Generate filename and content hash
  const fileName = generateFileName(data.title, data.id);
  const contentHash = generateContentHash(body);

  return {
    fileName,
    frontmatter,
    body,
    contentHash,
  };
}
