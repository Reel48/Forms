import React from 'react';

/**
 * Converts markdown-style links [text](url) and plain URLs to clickable HTML links
 * @param text The text to process
 * @returns JSX element with clickable links
 */
export function renderTextWithLinks(text: string): React.ReactElement {
  if (!text) return React.createElement(React.Fragment);

  const elements: (string | React.ReactElement)[] = [];
  let keyCounter = 0;

  // First, find all markdown links [text](url)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const markdownMatches: Array<{ index: number; linkText: string; url: string; endIndex: number }> = [];
  
  let match;
  while ((match = markdownLinkRegex.exec(text)) !== null) {
    const url = match[2].startsWith('http') ? match[2] : `https://${match[2]}`;
    markdownMatches.push({
      index: match.index,
      linkText: match[1],
      url: url,
      endIndex: match.index + match[0].length,
    });
  }

  // Process text, inserting markdown links and plain URLs
  let currentIndex = 0;
  
  for (const markdownMatch of markdownMatches) {
    // Add text before the markdown link (and process plain URLs in it)
    if (markdownMatch.index > currentIndex) {
      const beforeText = text.substring(currentIndex, markdownMatch.index);
      elements.push(...processPlainUrls(beforeText, keyCounter));
      keyCounter += beforeText.length;
    }
    
    // Add the markdown link
    elements.push(
      React.createElement(
        'a',
        {
          key: `md-link-${keyCounter++}`,
          href: markdownMatch.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          style: { color: '#2563eb', textDecoration: 'underline' },
        },
        markdownMatch.linkText
      )
    );
    
    currentIndex = markdownMatch.endIndex;
  }

  // Add remaining text (and process plain URLs in it)
  if (currentIndex < text.length) {
    const remainingText = text.substring(currentIndex);
    elements.push(...processPlainUrls(remainingText, keyCounter));
  }

  // If no markdown links were found, process the whole text for plain URLs
  if (markdownMatches.length === 0) {
    return React.createElement(React.Fragment, {}, ...processPlainUrls(text, 0));
  }

  return React.createElement(React.Fragment, {}, ...elements);
}

function processPlainUrls(text: string, startKey: number): (string | React.ReactElement)[] {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const elements: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match;
  let keyCounter = startKey;

  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      elements.push(text.substring(lastIndex, match.index));
    }

    // Add the URL as a link
    const url = match[0];
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    elements.push(
      React.createElement(
        'a',
        {
          key: `url-${keyCounter++}`,
          href: fullUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          style: { color: '#2563eb', textDecoration: 'underline' },
        },
        url
      )
    );

    lastIndex = urlRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }

  return elements.length > 0 ? elements : [text];
}

