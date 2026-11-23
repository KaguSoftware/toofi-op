// All route definitions. Flat code-based routes; access is enforced once, in the root
// beforeLoad (lib/navLogic.ts guardRedirect, from @rop/core canAccess/ROUTE_ROLES), so a
// new route needs no guard code, only an entry in ROUTE_ROLES if it is not under an
// existing prefix.
//
// ONE BLOCK PER AREA. Parallel agents edit only their own block and the matching line
// in `routeTree` at the bottom (each area contributes a `<area>Routes` array).
import { createRootRouteWithContext, createRoute, redirect } from '@tanstack/react-router';
import type { StaffRole } from '@rop/core';
import { LoginScreen } from './features/auth/LoginScreen';
import { FloorScreen } from './features/floor/FloorScreen';
import { TabScreen } from './features/tab/TabScreen';
import { TillScreen } from './features/till/TillScreen';
import { ShiftScreen } from './features/till/ShiftScreen';
import { ReportsScreen } from './features/manage/ReportsScreen';
import { DayScreen } from './features/manage/DayScreen';
import { MenuScreen } from './features/manage/MenuScreen';
import { FloorPlanScreen } from './features/manage/FloorPlanScreen';
import { StaffScreen } from './features/manage/StaffScreen';
import { StockScreen } from './features/stock/StockScreen';
import { OnHandScreen } from './features/stock/OnHandScreen';
import { ReceiveScreen } from './features/stock/ReceiveScreen';
import { WasteScreen } from './features/stock/WasteScreen';
import { CountScreen } from './features/stock/CountScreen';
import { RecipesScreen } from './features/stock/RecipesScreen';
import { MarginsScreen } from './features/stock/MarginsScreen';
import { AdminScreen } from './features/stock/AdminScreen';
import { guardRedirect, type AuthStatus } from './lib/navLogic';
import { RootLayout } from './shell/RootLayout';

export interface RouterContext {
  auth: { status: AuthStatus; role: StaffRole | null };
}

// ---- shell: root, index and login (app-foundation owns this block) ----
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  beforeLoad: ({ context, location }) => {
    const to = guardRedirect(context.auth.status, context.auth.role, location.pathname);
    if (to) throw redirect({ to });
  },
});
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginScreen });
const shellRoutes = [indexRoute, loginRoute];

// ---- floor: /floor ----
const floorRoute = createRoute({ getParentRoute: () => rootRoute, path: '/floor', component: FloorScreen });
const floorRoutes = [floorRoute];

// ---- tab: /tab/$tabId ----
const tabRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tab/$tabId', component: TabScreen });
const tabRoutes = [tabRoute];

// ---- till: /till, /till/shift ----
const tillRoute = createRoute({ getParentRoute: () => rootRoute, path: '/till', component: TillScreen });
const shiftRoute = createRoute({ getParentRoute: () => rootRoute, path: '/till/shift', component: ShiftScreen });
const tillRoutes = [tillRoute, shiftRoute];

// ---- manage: /manage, /manage/day, /manage/menu, /manage/floor, /manage/staff ----
const manageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/manage', component: ReportsScreen });
const dayRoute = createRoute({ getParentRoute: () => rootRoute, path: '/manage/day', component: DayScreen });
const menuRoute = createRoute({ getParentRoute: () => rootRoute, path: '/manage/menu', component: MenuScreen });
const floorPlanRoute = createRoute({ getParentRoute: () => rootRoute, path: '/manage/floor', component: FloorPlanScreen });
const staffRoute = createRoute({ getParentRoute: () => rootRoute, path: '/manage/staff', component: StaffScreen });
const manageRoutes = [manageRoute, dayRoute, menuRoute, floorPlanRoute, staffRoute];

// ---- stock: /stock (layout with sub-nav) and its children ----
const stockRoute = createRoute({ getParentRoute: () => rootRoute, path: '/stock', component: StockScreen });
const stockChild = (path: string, component: () => React.JSX.Element) =>
  createRoute({ getParentRoute: () => stockRoute, path, component });
const stockRoutes = [
  stockRoute.addChildren([
    stockChild('/', OnHandScreen),
    stockChild('receive', ReceiveScreen),
    stockChild('waste', WasteScreen),
    stockChild('count', CountScreen),
    stockChild('recipes', RecipesScreen),
    stockChild('margins', MarginsScreen),
    stockChild('admin', AdminScreen),
  ]),
];

export const routeTree = rootRoute.addChildren([
  ...shellRoutes,
  ...floorRoutes,
  ...tabRoutes,
  ...tillRoutes,
  ...manageRoutes,
  ...stockRoutes,
]);
