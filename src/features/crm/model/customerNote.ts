const ALLOWED_TAGS = new Set(['P', 'DIV', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A']);

export const plainTextToNoteHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

export const sanitizeCustomerNoteHtml = (value: string) => {
  if (typeof window === 'undefined') return value;
  const documentValue = new DOMParser().parseFromString(value, 'text/html');
  [...documentValue.body.querySelectorAll('*')].forEach(element => {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    [...element.attributes].forEach(attribute => {
      const isSafeLink = element.tagName === 'A' && attribute.name === 'href';
      const alignment =
        attribute.name === 'style' ? attribute.value.match(/^text-align:\s*(left|center|right|justify);?$/i)?.[1] : '';
      const isSafeAlignment = Boolean(alignment) && (element.tagName === 'P' || element.tagName === 'DIV');
      if (!isSafeLink && !isSafeAlignment) element.removeAttribute(attribute.name);
      if (isSafeAlignment) element.setAttribute('style', `text-align: ${alignment?.toLowerCase()}`);
    });
    if (element.tagName === 'A') {
      const href = element.getAttribute('href') || '';
      if (!/^(https?:|mailto:)/i.test(href)) element.removeAttribute('href');
      else {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noreferrer');
      }
    }
  });
  return documentValue.body.innerHTML;
};

export const customerNoteHtmlToText = (value: string) => {
  if (typeof window === 'undefined') return value.replace(/<[^>]+>/g, ' ');
  const documentValue = new DOMParser().parseFromString(value, 'text/html');
  documentValue.body.querySelectorAll('br').forEach(element => element.replaceWith('\n'));
  documentValue.body.querySelectorAll('p, div, li').forEach(element => element.append('\n'));
  return (documentValue.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
