import { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function MathFormula({ formula, display = false, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      katex.render(formula, ref.current, {
        throwOnError: false,
        displayMode: display,
      });
    }
  }, [formula, display]);

  return <span ref={ref} className={className} />;
}
