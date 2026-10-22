# Reference Operator Decision & Classification Rules

The `referenceOperator` bot serves as an automated reference benchmark for trainee evaluation. It operates under strict realism constraints:
1. **Zero Ground-Truth Access**: The bot receives only the sanitized `TraineeView`. It has zero access to actor IDs, true positions, true velocities, or truth classes.
2. **Zero Scenario-Specific Geometry Knowledge**: The bot has no knowledge of scenario layout, threat corridors, or expected spawn bearings (all bearing-sector filtering rules are eliminated).
3. **Confirmed & Valid Velocity Precondition**: A contact must be in state `'confirmed'` AND have `velocityValid === true` (at least 2 successful radar sweeps) before any classification or weapon engagement decision is dispatched.

---

## 1. Tactical Cue Extraction

From each `TraineeTrack`, the bot inspects:
- `track.state`: Confirmation status (`'tentative'` vs `'confirmed'`).
- `track.velocityValid`: Boolean flag indicating if $\ge 2$ radar sweeps have occurred to yield valid finite-difference or smoothed velocity.
- `track.speedMps`: Estimated 3D velocity magnitude ($|v|$ in m/s).
- `track.closingRateMps`: Radial closing rate relative to asset: $\frac{r \cdot v}{|r|}$ (negative = approaching asset).
- `track.courseDeg`: Ground track travel azimuth clockwise from North ($0^\circ - 360^\circ$).
- `track.bearingDeg`: Azimuth from defended asset to the contact ($0^\circ - 360^\circ$).
- `headingError`: Angular difference between `courseDeg` and the reciprocal bearing pointing directly from contact to asset:
  $$\text{BearingToAsset} = (\text{bearingDeg} + 180^\circ) \bmod 360^\circ$$
  $$\text{HeadingError} = |\text{courseDeg} - \text{BearingToAsset}| \quad (\text{wrapped to } [0^\circ, 180^\circ])$$
  An error $\le 35^\circ$ signifies direct inbound flight towards the defended asset.
- `track.headingChangeRateDegPerS`: Smoothed turn rate ($\Delta \theta / \Delta t$ in deg/s).
- `track.rcsBucket`: Radar cross section category (`'tiny'`, `'small'`, `'medium'`).
- `track.quality`: Track correlation confidence metric ($0.0 - 1.0$).

---

## 2. Decision Tree & Classification Rules

When a confirmed track with valid velocity has `assessedClass === undefined`:

```
                    [Confirmed Track with Valid Velocity]
                                      │
               ┌──────────────────────┴──────────────────────┐
          Quality < 0.28?                                Quality >= 0.28
               │                                             │
      [Assess CLUTTER / GHOST]                               ▼
                                               rcsBucket == 'tiny' OR
                                          (Speed < 16 & TurnRate > 3.5)?
                                             │                       │
                                           [YES]                    [NO]
                                             │                       │
                                      [Assess BIRD]                  ▼
                                                               Altitude >= 160 &
                                                               Speed >= 18?
                                                                 │        │
                                                               [YES]     [NO]
                                                                 │        │
                                                   [Assess RECON]         ▼
                                                                    Speed >= 18 &
                                                                    Closing <= -15 &
                                                                    HeadingError <= 40?
                                                                      │            │
                                                                    [YES]         [NO]
                                                                      │            │
                                                              [Assess FPV]         ▼
                                                                          Speed >= 6 &
                                                                   (Closing > -14 OR HeadingError > 45)?
                                                                      │            │
                                                                    [YES]         [NO]
                                                                      │            │
                                                                 [Assess QUAD]  [Assess BIRD / QUAD]
```

### High-Altitude Reconnaissance & Inbound Threat Re-evaluation
If a track exhibits high altitude ($\ge 160\text{ m}$) and cruise speed ($\ge 18\text{ m/s}$), it is assessed as `fixed_wing_recon`.
If a track was initially assessed as neutral or civilian, but subsequent telemetry shows:
$$\text{rcsBucket} \neq \text{'tiny'} \land \text{speed} \ge 18\text{ m/s} \land \text{closingRate} \le -15\text{ m/s} \land \text{headingError} \le 35^\circ$$
The bot immediately promotes its assessment to `fpv_kamikaze`.

---

## 3. Weapon Engagement Rules

For tracks assessed as `fpv_kamikaze` or `fixed_wing_recon`:
1. If $\text{range} \le 1500\text{ m}$ and `jammer.busyUntilTick <= currentTick`:
   $\to$ Dispatch `ENGAGE_TRACK` with `effector: 'jammer'` (soft-kill).
2. Else if $\text{range} \le 1000\text{ m}$ and `gun.busyUntilTick <= currentTick` and `gun.ammo > 0`:
   $\to$ Dispatch `ENGAGE_TRACK` with `effector: 'gun'` (hard-kill).

For tracks assessed as `commercial_quad`, `bird`, or `clutter`:
$\to$ Dispatch `HOLD_FIRE` directive once to record restraint and avoid accidental engagement.
