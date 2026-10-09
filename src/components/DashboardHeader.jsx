import { useState } from "react";
import { Bell, ChevronDown, Home, LogOut, Search, Settings, Truck, PackageCheck, FileText, WalletCards, UserRound } from "lucide-react";
import ThemeSwitcher from "./ThemeSwitcher.jsx";

const groups = [
  { label: "Dashboard", icon: Home, tabs: ["dashboard"] },
  { label: "Courier", icon: Truck, tabs: ["courier"] },
  { label: "Operations", icon: PackageCheck, tabs: ["operation", "autoDispatch"] },
  { label: "Reports", icon: FileText, tabs: ["exports", "allReports", "audit"] },
  { label: "Deliveries", icon: PackageCheck, tabs: ["deliveredConverter", "reschedule"] },
  { label: "Finance", icon: WalletCards, tabs: ["pettyCash", "receipt"] },
  { label: "Settings", icon: Settings, tabs: ["whatsappQueue", "settings", "meterChats", "users"] },
];

function closeMenu(event) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

function closeOtherMenus(event) {
  const current = event.currentTarget;
  if (!current.open) return;
  current.closest("header").querySelectorAll("details[open]").forEach((menu) => {
    if (menu !== current) menu.removeAttribute("open");
  });
}

export default function DashboardHeader({
  tabs, activeTab, onOpen, session, branchName, branches, onBranchChange,
  onLogout, theme, onThemeChange, summary, history, onHistoryView, approvals,
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery
    ? tabs.filter((tab) => `${tab.label} ${tab.mobileLabel}`.toLowerCase().includes(normalizedQuery))
    : [];
  const dates = normalizedQuery && tabs.some((tab) => tab.id === "exports")
    ? history.filter((item) => item.date.includes(normalizedQuery)).slice(0, 4)
    : [];
  const name = session.displayName || session.homeBranchName || session.branchName || "Branch";
  const notificationCount = summary.exceptions + summary.whatsappPending + approvals;

  function openSearchResult(tab) {
    onOpen(tab);
    setQuery("");
    setSearchOpen(false);
  }

  return (
    <header className="domex-header no-print" onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.currentTarget.querySelectorAll("details[open]").forEach((menu) => menu.removeAttribute("open"));
        setSearchOpen(false);
      }
    }}>
      <button type="button" className="domex-brand" aria-label="DOMEX home"
        onClick={() => onOpen(tabs.some((tab) => tab.id === "dashboard") ? "dashboard" : tabs[0]?.id)}>
        <img className="domex-brand-logo" src="/report-assets/domex-logo.png" alt="DOMEX — We deliver islandwide" />
      </button>
      <nav className="domex-navigation" aria-label="Main navigation">
        {groups.map((group) => {
          const available = group.tabs.map((id) => tabs.find((tab) => tab.id === id)).filter(Boolean);
          if (!available.length) return null;
          const Icon = group.icon;
          const active = group.tabs.includes(activeTab);
          const itemClass = `domex-nav-item ${active ? "is-active" : ""}`;
          if (available.length === 1) {
            return (
              <button key={group.label} type="button" className={itemClass}
                aria-current={active ? "page" : undefined} onClick={() => onOpen(available[0].id)}>
                <Icon size={17} /><span>{group.label}</span>
              </button>
            );
          }
          return (
            <details key={group.label} className="domex-nav-group" onToggle={closeOtherMenus}>
              <summary className={itemClass} aria-current={active ? "page" : undefined}>
                <Icon size={17} /><span>{group.label}</span><ChevronDown size={12} />
              </summary>
              <div className="domex-dropdown">
                {available.map((tab) => (
                  <button key={tab.id} type="button" aria-current={tab.id === activeTab ? "page" : undefined}
                    onClick={(event) => { onOpen(tab.id); closeMenu(event); }}>
                    <tab.icon size={17} />{tab.label}
                  </button>
                ))}
              </div>
            </details>
          );
        })}
      </nav>
      <div className="domex-header-tools">
        <div className="domex-search" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
        }}>
          <Search size={18} />
          <input aria-label="Search sections or report dates" type="search" placeholder="Search anything…"
            value={query} onFocus={() => setSearchOpen(true)}
            onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} />
          {searchOpen && normalizedQuery ? (
            <div className="domex-dropdown domex-search-results">
              <p>Sections & saved report dates</p>
              {matches.map((tab) => (
                <button key={tab.id} type="button" onClick={() => openSearchResult(tab.id)}>
                  <tab.icon size={16} />{tab.label}
                </button>
              ))}
              {dates.map((item) => (
                <button key={item.date} type="button" onClick={() => {
                  onHistoryView(item.date);
                  setQuery("");
                  setSearchOpen(false);
                }}><FileText size={16} />Report · {item.date}</button>
              ))}
              {!matches.length && !dates.length ? <p>No matching sections or saved dates.</p> : null}
            </div>
          ) : null}
        </div>
        <details className="domex-notifications" onToggle={closeOtherMenus}>
          <summary className="domex-bell" aria-label={`Notifications, ${notificationCount} items need attention`}>
            <Bell size={23} />{notificationCount > 0 ? <span>{notificationCount}</span> : null}
          </summary>
          <div className="domex-dropdown">
            <p className="dropdown-title">Branch notifications</p>
            <p>{summary.ready ? "All daily reports are complete." : `${summary.reportsRemaining} daily reports remaining.`}</p>
            {summary.exceptions ? <p>{summary.exceptions} delivery exceptions to review.</p> : null}
            {summary.whatsappPending ? <button type="button" onClick={(event) => { onOpen("whatsappQueue"); closeMenu(event); }}>{summary.whatsappPending} WhatsApp sends need attention →</button> : null}
            {approvals ? (
              <button type="button" onClick={(event) => { onOpen("users"); closeMenu(event); }}>
                {approvals} accounts waiting for approval
              </button>
            ) : null}
          </div>
        </details>
        <details className="domex-profile-menu" onToggle={closeOtherMenus}>
          <summary className="domex-profile" aria-label={`Profile and workspace for ${name}`}>
            <span className="domex-avatar">
              {session.photoURL
                ? <img src={session.photoURL} alt="" referrerPolicy="no-referrer" />
                : <UserRound size={21} />}
            </span>
            <span><strong>{name}</strong><small>{branchName} Branch</small></span>
            <ChevronDown size={16} />
          </summary>
          <div className="domex-dropdown domex-profile-dropdown">
            <p className="dropdown-title">Your workspace</p>
            {branches.length > 0 ? (
              <label className="domex-branch-select">Viewing branch
                <select value={session.branchName} onChange={onBranchChange}>
                  {branches.map((branch) => <option key={branch} value={branch}>{branch.toUpperCase()}</option>)}
                </select>
              </label>
            ) : null}
            <ThemeSwitcher value={theme} onChange={onThemeChange} compact />
            <button type="button" onClick={onLogout}><LogOut size={17} />Log out</button>
          </div>
        </details>
      </div>
    </header>
  );
}
