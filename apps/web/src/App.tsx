import { useRef, useState } from 'react';
import { buy, type BuyOutcome } from './api';
import { BuyButton } from './components/BuyButton';
import { Header } from './components/Header';
import { OrderStatusRow } from './components/OrderStatusRow';
import { ProductCard } from './components/ProductCard';
import { ResultPanel } from './components/ResultPanel';
import { SignInForm, type Session } from './components/SignInForm';
import { Skeleton } from './components/Skeleton';
import { StatusCard } from './components/StatusCard';
import { useOrderStatus } from './useOrderStatus';
import { useSale } from './useSale';

// Answers where we might still have a unit, so we ask /me.
// 409: show the existing order. 503 and NETWORK: the gate may have worked anyway.
const CHECK_ORDER_AFTER: BuyOutcome[] = ['ALREADY_PURCHASED', 'UNAVAILABLE', 'NETWORK'];

export default function App() {
  const { sale, offsetMs, now, failing } = useSale();
  const order = useOrderStatus();
  // The token is kept in memory only. A reload signs you out. Nothing saved in the browser.
  const [session, setSession] = useState<Session | null>(null);
  const [outcome, setOutcome] = useState<BuyOutcome | null>(null);
  const [buying, setBuying] = useState(false);
  // State only updates on the next render, so two fast clicks would both see buying === false.
  // A ref changes at once, so the second click stops here.
  const buyInFlight = useRef(false);

  function expireSession() {
    order.reset();
    setSession(null);
    setOutcome('SESSION_EXPIRED');
  }

  function followOrder(token: string, assumeReserved = false) {
    void order.track(token, assumeReserved).then((answer) => {
      if (answer === 'SESSION_EXPIRED') expireSession();
    });
  }

  function signIn(next: Session) {
    setSession(next);
    setOutcome(null);
    // A returning buyer sees their order right away.
    followOrder(next.accessToken);
  }

  function signOut() {
    order.reset();
    setSession(null);
    setOutcome(null);
  }

  async function handleBuy() {
    if (!session || buyInFlight.current) return;
    buyInFlight.current = true;
    setBuying(true);
    setOutcome(null);
    const result = await buy(session.accessToken);
    buyInFlight.current = false;
    setBuying(false);

    if (result === 'SESSION_EXPIRED') {
      expireSession();
      return;
    }
    setOutcome(result);
    if (result === 'SUCCESS') followOrder(session.accessToken, true);
    else if (CHECK_ORDER_AFTER.includes(result)) followOrder(session.accessToken);
  }

  if (!sale) {
    return (
      <>
        <Header />
        <Skeleton failing={failing} />
      </>
    );
  }

  const purchased = order.status !== null;
  const button = { status: sale.status, stockRemaining: sale.stockRemaining, purchased };

  return (
    <>
      <Header userId={session?.userId} onSignOut={signOut} />
      <main className="grid gap-4 p-5 md:grid-cols-2 md:gap-10 md:p-12">
        <ProductCard product={sale.product} />
        <section aria-label="Sale" className="flex flex-col gap-4 md:gap-5">
          <StatusCard sale={sale} now={now} offsetMs={offsetMs} failing={failing} />
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 md:px-8 md:py-7">
            {session ? (
              <>
                <span className="text-sm text-muted md:hidden">
                  Signed in as <strong className="text-ink">{session.userId}</strong>
                </span>
                <BuyButton {...button} pending={buying} onBuy={() => void handleBuy()} />
              </>
            ) : (
              <SignInForm onSignedIn={signIn} />
            )}
            <ResultPanel outcome={outcome} />
            {session && <OrderStatusRow status={order.status} watching={order.watching} />}
          </div>
        </section>
      </main>
    </>
  );
}
