import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FaPaperclip } from 'react-icons/fa';
import type { ChatMessage } from '../../api';

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function ChatMessageBody({
  message,
  renderAsMarkdown,
}: {
  message: ChatMessage;
  renderAsMarkdown: boolean;
}) {
  if ((message.message_type === 'image' || message.message_type === 'file') && message.file_url) {
    if (message.message_type === 'image') {
      return (
        <img
          src={message.file_url}
          alt={message.file_name || 'Image'}
          className="message-image"
          loading="lazy"
          onClick={() => {
            // Open image in new tab for better viewing
            window.open(message.file_url, '_blank');
          }}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '400px',
            borderRadius: '12px',
            cursor: 'pointer',
            display: 'block',
            margin: '0.5rem 0'
          }}
        />
      );
    }

    const size = formatFileSize(message.file_size);
    return (
      <a
        href={message.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className="message-file-link"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          color: 'inherit',
          textDecoration: 'none',
        }}
      >
        <FaPaperclip />
        <span>
          {message.file_name || 'File'}
          {size ? ` (${size})` : ''}
        </span>
      </a>
    );
  }

  if (!renderAsMarkdown) {
    return <>{message.message}</>;
  }

  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.message}</ReactMarkdown>
    </div>
  );
}

