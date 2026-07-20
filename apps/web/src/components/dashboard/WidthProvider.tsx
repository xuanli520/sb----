'use client';

import React, { useEffect, useRef, useState } from "react";

/**
 * A simple HOC that provides width to the wrapped component.
 * Replaces the missing WidthProvider from react-grid-layout v2+.
 */
export function WidthProvider(ComposedComponent: React.ComponentType<any>) {
  return function WidthProviderWrapper(props: any) {
    const [width, setWidth] = useState(1200);
    const elementRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const element = elementRef.current;
        if (!element) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                 // Use contentRect.width for precise content width
                setWidth(entry.contentRect.width);
            }
        });

        resizeObserver.observe(element);
        
        // Initial measure
        setWidth(element.getBoundingClientRect().width);

        return () => resizeObserver.disconnect();
    }, []);

    return (
      <div ref={elementRef} className={props.className} style={props.style}>
         <ComposedComponent {...props} width={width} />
      </div>
    );
  };
}
