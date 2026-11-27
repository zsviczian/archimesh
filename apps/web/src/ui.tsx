import { uuidSchema } from '@archimesh/contracts';
import type { MouseEvent, ReactNode } from 'react';

const icons = {
  mesh: 'M8 4h8l4 8-4 8H8l-4-8z M8 4l8 16 M16 4L8 20 M4 12h16',
  catalog: 'M4 5h16v14H4z M4 9h16 M9 9v10 M13 13h4 M13 16h4',
  application: 'M4 5h16v14H4z M4 9h16 M8 13h8 M8 16h5',
  instance: 'M6 4h12v6H6z M6 14h12v6H6z M9 7h.01 M9 17h.01 M13 7h2 M13 17h2',
  capability: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9',
  business:
    'M5 7c0-2 3-4 7-4s7 2 7 4v10c0 2-3 4-7 4s-7-2-7-4z M5 7c0 2 3 4 7 4s7-2 7-4 M5 12c0 2 3 4 7 4s7-2 7-4',
  project: 'M4 7h6l2 2h8v10H4z M4 7V5h7l2 2h6',
  relationship:
    'M7 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M17 13a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M9 10l6 4',
  view: 'M4 5h16v14H4z M4 9h16 M9 9v10',
  category: 'M4 5h7l9 9-6 6-10-10z M8 9h.01',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.5 15.5l4 4',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  edit: 'M5 16v3h3L19 8l-3-3z M14 7l3 3',
  history: 'M5 12a7 7 0 1 1 1.7 4.6 M5 12V7 M5 12h5 M12 8v4l3 2',
  document: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',
  sun: 'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6 7 7 M17 17l1.4 1.4 M5.6 18.4 7 17 M17 7l1.4-1.4 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M19.7 15.1A8 8 0 0 1 9 4.3 8 8 0 1 0 19.7 15.1z',
  chevron: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12 M18 6L6 18',
} as const;

type IconName = keyof typeof icons;
export function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={icons[name]} />
    </svg>
  );
}

const typeIcons: Record<string, IconName> = {
  'application-category': 'category',
  application: 'application',
  'application-instance': 'instance',
  capability: 'capability',
  'business-object': 'business',
  project: 'project',
  relationship: 'relationship',
  viewpoint: 'view',
  view: 'view',
};

export function TypeIcon({ type }: { type: string }) {
  return (
    <span className="type-icon" data-type={type}>
      <Icon name={typeIcons[type] ?? 'document'} />
    </span>
  );
}

export function label(value: string) {
  return value.replace(/-/g, ' ').replace(/^./, (first) => first.toUpperCase());
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function objectUrl(id: string, revision?: string) {
  const path = `/objects/${encodeURIComponent(id)}`;
  return revision ? `${path}?${new URLSearchParams({ revision })}` : path;
}

export function objectPathId(path?: string | null) {
  const id = /^\/objects\/([0-9a-f-]+)$/i.exec(path ?? '')?.[1];
  return id && uuidSchema.safeParse(id).success ? id : undefined;
}

export type Navigate = (path: string) => void;

export function LocalLink({
  children,
  to,
  navigate,
  className,
  ariaCurrent,
  title,
}: {
  children: ReactNode;
  to: string;
  navigate: Navigate;
  className?: string;
  ariaCurrent?: 'page';
  title?: string;
}) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.defaultPrevented
    )
      return;
    event.preventDefault();
    navigate(to);
  }

  return (
    <a
      className={className}
      href={to}
      onClick={onClick}
      aria-current={ariaCurrent}
      title={title}
    >
      {children}
    </a>
  );
}

export function EmptyState({
  title,
  children,
  error = false,
}: {
  title: string;
  children?: ReactNode;
  error?: boolean;
}) {
  return (
    <div className="empty-state" role={error ? 'alert' : undefined}>
      <span className="empty-icon">
        <Icon name={error ? 'close' : 'catalog'} size={20} />
      </span>
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function displayError(error: unknown, fallback: string) {
  return error instanceof Error && error.name === 'ApiError'
    ? error.message
    : fallback;
}
