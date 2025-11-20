import React from 'react';

/**
 * Converts markdown-style links [text](url), plain URLs, and bold text (**text**) to HTML
 * @param text The text to process
 * @returns JSX element with clickable links and formatted text
 */
export function renderTextWithLinks(text: string): React.ReactElement {
  if (!text) return React.createElement(React.Fragment);

  // Process the text: first handle bold, then links, then URLs
  const processedElements = processTextWithMarkdown(text);
  
  return React.createElement(React.Fragment, {}, ...processedElements);
}

/**
 * Process text with markdown formatting (bold, links, URLs)
 */
function processTextWithMarkdown(text: string): (string | React.ReactElement)[] {
  const elements: (string | React.ReactElement)[] = [];
  let keyCounter = 0;
  
  // Find all markdown links [text](url) and bold **text**
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const boldRegex = /\*\*([^*]+)\*\*/g;
  
  // Collect all matches with their positions
  const matches: Array<{ index: number; type: 'link' | 'bold'; endIndex: number; data: any }> = [];
  
  let match;
  while ((match = markdownLinkRegex.exec(text)) !== null) {
    const url = match[2].startsWith('http') ? match[2] : `https://${match[2]}`;
    matches.push({
      index: match.index,
      type: 'link',
      endIndex: match.index + match[0].length,
      data: { linkText: match[1], url: url }
    });
  }
  
  while ((match = boldRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      type: 'bold',
      endIndex: match.index + match[0].length,
      data: { text: match[1] }
    });
  }
  
  // Sort matches by index
  matches.sort((a, b) => a.index - b.index);
  
  // Process text, inserting formatted elements
  let currentIndex = 0;
  
  for (const matchItem of matches) {
    // Add text before the match (and process plain URLs in it)
    if (matchItem.index > currentIndex) {
      const beforeText = text.substring(currentIndex, matchItem.index);
      elements.push(...processPlainUrls(beforeText, keyCounter));
      keyCounter += beforeText.length;
    }
    
    // Add the formatted element
    if (matchItem.type === 'link') {
      elements.push(
        React.createElement(
          'a',
          {
            key: `md-link-${keyCounter++}`,
            href: matchItem.data.url,
            target: '_blank',
            rel: 'noopener noreferrer',
            style: { color: '#2563eb', textDecoration: 'underline' },
          },
          matchItem.data.linkText
        )
      );
    } else if (matchItem.type === 'bold') {
      elements.push(
        React.createElement('strong', { key: `bold-${keyCounter++}` }, matchItem.data.text)
      );
    }
    
    currentIndex = matchItem.endIndex;
  }
  
  // Add remaining text (and process plain URLs in it)
  if (currentIndex < text.length) {
    const remainingText = text.substring(currentIndex);
    elements.push(...processPlainUrls(remainingText, keyCounter));
  }
  
  // If no markdown was found, just process plain URLs
  if (matches.length === 0) {
    return processPlainUrls(text, 0);
  }
  
  return elements;
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

