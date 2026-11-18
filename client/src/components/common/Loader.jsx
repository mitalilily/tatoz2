const sizeMap = {
  sm: { shell: 'h-4 w-4', ring: 'border-2', text: 'text-[11px]' },
  md: { shell: 'h-6 w-6', ring: 'border-2', text: 'text-xs' },
  lg: { shell: 'h-8 w-8', ring: 'border-[3px]', text: 'text-sm' },
};

/**
 * Shared lightweight loader.
 *
 * Keep loading feedback consistent across the app and avoid mounting a
 * separate animation stylesheet for every page that imports the loader.
 */
const Loader = ({ size = 'md', text, fullScreen = false, inline = false, className = '' }) => {
  const { shell, ring, text: textSize } = sizeMap[size] ?? sizeMap.md;
  const Content = inline ? 'span' : 'div';
  const content = (
    <Content className={`${inline ? 'inline-flex' : 'flex w-full'} flex-col items-center justify-center gap-2 ${className}`} data-testid="site-loader-content">
      <span
        className={`${shell} ${ring} inline-block rounded-full border-gray-200 border-t-primary-600 motion-safe:animate-spin`}
        aria-hidden="true"
      />
      {text && <p className={`${textSize} font-medium text-gray-500 select-none`}>{text}</p>}
    </Content>
  );

  if (fullScreen) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white" role="status" aria-label={text ?? 'Loading'}>
        {content}
      </div>
    );
  }

  if (inline) return <span className="inline-flex items-center justify-center" role="status" aria-label={text ?? 'Loading'}>{content}</span>;
  return <div className="flex w-full items-center justify-center" role="status" aria-label={text ?? 'Loading'}>{content}</div>;
};

export default Loader;
