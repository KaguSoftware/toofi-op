import { MenuSkeleton } from '@/components/MenuSkeleton';
import { CornerOrnament, StarStrip } from '@/components/Ornaments';
import { guestCopy } from '@/lib/copyLogic';
import { requestLocale } from '@/lib/server/locale';

/** Shown while the page reads the menu: the same frame, skeleton rows, never a blank page. */
export default async function Loading() {
  const copy = guestCopy(await requestLocale());
  return (
    <div className="guest">
      <CornerOrnament />
      <div className="guest__body">
        <header className="top">
          <span className="top__name" />
        </header>
        <StarStrip />
        <MenuSkeleton label={copy.menu.loading} />
      </div>
    </div>
  );
}
