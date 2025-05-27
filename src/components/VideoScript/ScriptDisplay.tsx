import React from 'react';

interface ScriptDisplayProps {
  content: string;
  className?: string;
}

export function ScriptDisplay({ content, className = '' }: ScriptDisplayProps) {
  // Process the content to handle formatting
  const formatContent = (text: string) => {
    if (!text) return null;

    // Split by lines to preserve line breaks
    const lines = text.split('\n');
    
    return lines.map((line, lineIndex) => {
      // Handle empty lines
      if (!line.trim()) {
        return <br key={lineIndex} />;
      }

      // Process each line for bold text (text between *asterisks*)
      const formatLine = (text: string) => {
        const parts = text.split(/(\*[^*]+\*|\*\*[^*]+\*\*)/g);
        
        return parts.map((part, partIndex) => {
          // Check if this part should be bold (surrounded by asterisks)
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            const boldText = part.slice(2, -2);
            return <strong key={partIndex}>{boldText}</strong>;
          }
          if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            const boldText = part.slice(1, -1);
            return <strong key={partIndex}>{boldText}</strong>;
          }
          
          return part;
        });
      };

      const trimmedLine = line.trim();
      
      // Check if it's a quote (starts and ends with quotes)
      if (trimmedLine.startsWith('"') && trimmedLine.endsWith('"')) {
        return (
          <p key={lineIndex} className="italic text-lg my-3 text-muted-foreground">
            {formatLine(line)}
          </p>
        );
      }

      // Check if it's a numbered list item
      const numberedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        return (
          <div key={lineIndex} className="flex gap-3 mb-2 ml-4">
            <span className="font-semibold text-primary">{numberedMatch[1]}.</span>
            <span className="flex-1">{formatLine(numberedMatch[2])}</span>
          </div>
        );
      }

      // Check if it's a bullet point
      if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('• ')) {
        return (
          <div key={lineIndex} className="flex gap-2 mb-2 ml-4">
            <span className="text-primary">•</span>
            <span className="flex-1">{formatLine(trimmedLine.slice(2))}</span>
          </div>
        );
      }

      // Check if it's a section header (all caps or ends with colon)
      const isHeader = trimmedLine === trimmedLine.toUpperCase() || 
                      trimmedLine.endsWith(':') || 
                      trimmedLine.startsWith('SECTION') ||
                      trimmedLine.startsWith('HOOK') ||
                      trimmedLine.startsWith('INTRO') ||
                      trimmedLine.startsWith('TRANSITION') ||
                      trimmedLine.startsWith('OUTRO') ||
                      trimmedLine.startsWith('CTA');

      // Check if the entire line appears to be a title (first line)
      if (lineIndex === 0) {
        return (
          <h2 key={lineIndex} className="text-2xl font-bold mb-4">
            {formatLine(trimmedLine)}
          </h2>
        );
      }

      if (isHeader) {
        return (
          <h3 key={lineIndex} className="text-lg font-semibold mt-6 mb-3 text-primary">
            {formatLine(trimmedLine)}
          </h3>
        );
      }

      // Check for transition lines
      if (trimmedLine.startsWith('TRANSITION:') || trimmedLine.includes('"Now') || trimmedLine.includes('"Let\'s')) {
        return (
          <p key={lineIndex} className="my-4 italic text-muted-foreground">
            {formatLine(trimmedLine)}
          </p>
        );
      }

      // Regular paragraph
      return (
        <p key={lineIndex} className="mb-2">
          {formatLine(trimmedLine)}
        </p>
      );
    });
  };

  return (
    <div className={`${className} space-y-1`}>
      {formatContent(content)}
    </div>
  );
} 