export function Header({ userId, onSignOut }: { userId?: string; onSignOut?: () => void }) {
  return (
    <header className="flex h-15 items-center justify-between bg-navy px-5 md:h-18 md:px-12">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-[10px] bg-primary">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
          </svg>
        </div>
        <span className="text-lg font-extrabold tracking-tight text-white md:text-xl">
          Flash Sale
        </span>
      </div>
      {userId && (
        <div className="flex items-center gap-4">
          {/* On phones the name moves into the action card (design: purchase-page-mobile). */}
          <span className="hidden text-[15px] text-[#B7BCC7] md:inline">
            Signed in as <strong className="font-semibold text-white">{userId}</strong>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="h-11 rounded-full border border-[#3A4560] px-4 text-sm font-semibold text-white hover:bg-white/10 md:h-10"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
