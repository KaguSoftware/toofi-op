import { ICONS, categoryIconPaths, type IconName } from './icons';

interface Props {
  size?: number;
  /** The mock draws the category icons a little lighter (1.6) than the controls (1.75). */
  strokeWidth?: number;
}

function Svg({ paths, size = 24, strokeWidth = 1.75 }: Props & { paths: readonly string[] }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" strokeWidth={strokeWidth}>
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function Icon({ name, ...rest }: Props & { name: IconName }) {
  return <Svg paths={ICONS[name]} {...rest} />;
}

export function CategoryIcon({ icon, ...rest }: Props & { icon: string }) {
  return <Svg paths={categoryIconPaths(icon)} strokeWidth={1.6} {...rest} />;
}
