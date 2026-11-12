import type { Template } from './grading';

type Evidence = 'match' | 'incomplete' | 'conflict';

function printedText(value: string): string {
  return value
    .replace(
      /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/gu,
      (exponent) => '^' + exponent.normalize('NFKC'),
    )
    .normalize('NFKC')
    .toLocaleLowerCase('vi')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\(?:left|right)\b/g, '')
    .replace(/_(?:\{([a-z0-9]+)\}|([a-z0-9]))/g, '$1$2')
    .replace(/[−–]/g, '-')
    .replace(/\^\{([+-]?\d+)\}/g, '^$1')
    .replace(/\s+/gu, '')
    .replace(/(?<=\d)[×x](?=\d)/g, '*')
    .replace(/[.?:]+$/u, '');
}

function entriesMatch(expected: unknown, observed: unknown): Evidence {
  if (!Array.isArray(expected)) return 'match';
  if (!Array.isArray(observed)) return 'incomplete';
  let previousIndex = -1;
  let incomplete = observed.length < expected.length;
  for (const entry of observed as { id?: string; text?: string }[]) {
    if (!entry || typeof entry.id !== 'string') return 'conflict';
    const index = expected.findIndex(
      (value: { id?: string }) => value.id === entry.id,
    );
    if (index <= previousIndex) return 'conflict';
    previousIndex = index;
    const original = expected[index] as { text: string };
    if (typeof entry.text !== 'string' || !entry.text.trim()) incomplete = true;
    else if (printedText(original.text) !== printedText(entry.text))
      return 'conflict';
  }
  return incomplete ? 'incomplete' : 'match';
}

export function examEvidence(
  template: Template,
  fragments: Record<string, unknown>[],
): Evidence {
  const questions = new Map(
    template.questions.map((question) => [question.questionKey, question]),
  );
  const matched = new Set<string>();
  for (const fragment of fragments) {
    const key = fragment.questionKey;
    const question = typeof key === 'string' ? questions.get(key) : undefined;
    if (!question) return 'conflict';
    if (typeof fragment.kind === 'string' && fragment.kind !== question.kind)
      return 'conflict';
    const text =
      typeof fragment.text === 'string' ? printedText(fragment.text) : '';
    if (text && text !== printedText(question.text)) return 'conflict';
    const options = entriesMatch(question.options, fragment.options);
    const statements = entriesMatch(question.statements, fragment.statements);
    if (options === 'conflict' || statements === 'conflict') return 'conflict';
    if (text && options === 'match' && statements === 'match')
      matched.add(question.questionKey);
  }
  return matched.size === questions.size && questions.size > 0
    ? 'match'
    : 'incomplete';
}
