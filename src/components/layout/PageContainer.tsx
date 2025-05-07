
import React from "react";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}

export function PageContainer({
  children,
  className = "",
  title,
  description,
}: PageContainerProps) {
  return (
    <div className={`container py-6 ${className}`}>
      {(title || description) && (
        <div className="mb-6">
          {title && <h1 className="text-3xl font-bold">{title}</h1>}
          {description && (
            <p className="text-muted-foreground mt-2">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
