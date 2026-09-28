--[[
  Undo a reservation (rule 6, no lost stock).

  Used when the gate said SUCCESS but the order could not be queued.
  It gives the unit back and removes the buyer, so they can try again.

  Why SREM first: SREM returns 1 only if the user was really removed.
  Stock goes up only then. So running this twice changes nothing the second time.
  Without that check, a retry would add stock that was never taken: an oversell.

  KEYS[1] = sale:stock
  KEYS[2] = sale:buyers
  ARGV[1] = userId

  Returns 1 if a unit was given back, 0 if there was nothing to undo.
]]

if redis.call('SREM', KEYS[2], ARGV[1]) == 1 then
  -- They held a unit, so put it back.
  redis.call('INCR', KEYS[1])
  return 1
end
-- Nothing to undo: already released, or never bought.
return 0
