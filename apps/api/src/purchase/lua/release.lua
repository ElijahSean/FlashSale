--[[
  The compensating script (design rule 6, no lost stock).

  Used when a reservation succeeded but the order could not be queued. It undoes exactly what
  purchase.lua did: gives the unit back and removes the buyer, so they can try again.

  Why SREM comes first: SREM returns 1 only if it actually removed the user. Stock goes back up
  only in that case. So calling this twice, or for a user who never bought, changes nothing.
  Without that check, a retried release would add stock that was never taken: an oversell.

  KEYS[1] = sale:stock
  KEYS[2] = sale:buyers
  ARGV[1] = userId

  Returns 1 if a unit was given back, 0 if there was nothing to undo.
]]

-- Remove the buyer. 1 = they were in the set, 0 = they were not.
if redis.call('SREM', KEYS[2], ARGV[1]) == 1 then
  -- They held a unit, so put it back. Atomic with the SREM above.
  redis.call('INCR', KEYS[1])
  return 1
end
-- Nothing to undo: already released, or never bought.
return 0
