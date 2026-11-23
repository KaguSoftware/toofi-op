import { useState } from 'react';
import { Button, PageHeader } from '../../components';
import { useLocale } from '../../lib/i18n';
import { ManageScreen } from './ManageScreen';
import { RangePicker, useRangeState } from './RangePicker';
import { ReportsMenu } from './ReportsMenu';
import { ReportsOverview } from './ReportsOverview';
import { ReportsStaff } from './ReportsStaff';
import { ReportsStock } from './ReportsStock';
import { REPORT_TABS, type ReportTab } from './reportsLogic';
import './manage.css';
import './reports.css';

/** /manage: the reports. One date range shared by five sections; Overview opens first. */
export function ReportsScreen() {
  const { tr } = useLocale();
  const rangeState = useRangeState('last7');
  const [tab, setTab] = useState<ReportTab>('overview');
  const ok = rangeState.error === null;
  const { range } = rangeState;

  return (
    <section className="manage reports">
      <PageHeader title={tr('manage.title')} icon="reports" tone="accent">
        <div className="rop-segmented manage__tabs" role="tablist" aria-label={tr('reports.tabs.label')}>
          {REPORT_TABS.map((t) => (
            <Button key={t} role="tab" id={`reports-tab-${t}`} aria-selected={tab === t} aria-controls="reports-panel" onClick={() => setTab(t)}>
              {tr(`reports.tabs.${t}`)}
            </Button>
          ))}
        </div>
      </PageHeader>
      <RangePicker state={rangeState} />
      <div id="reports-panel" role="tabpanel" aria-labelledby={`reports-tab-${tab}`}>
        {tab === 'overview' && <ReportsOverview range={range} ok={ok} onTab={setTab} />}
        {tab === 'sales' && <ManageScreen shared={rangeState} />}
        {tab === 'menu' && <ReportsMenu range={range} ok={ok} />}
        {tab === 'stock' && <ReportsStock range={range} ok={ok} />}
        {tab === 'staff' && <ReportsStaff range={range} ok={ok} />}
      </div>
    </section>
  );
}
