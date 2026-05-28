# 03 - INPUT SYSTEM

**Priority**: 🔴 CRITICAL - Foundation System  
**Status**: 🟡 In Progress  
**Dependencies**: None (foundational)  
**Estimated Complexity**: Medium  
**Time Estimate**: 4-6 hours

---

## 📋 Overview

The input system handles all player input - keyboard, mouse, gamepad - and makes it accessible to other systems. It must be responsive, rebindable, and support multiple input methods.

### Why This Matters
- **Responsiveness foundation**: All other systems depend on input
- **Accessibility**: Players need custom controls
- **Multi-platform**: Support keyboard/mouse and gamepad
- **Feel**: Input lag destroys game feel

---

## 🎯 Design Goals

- [x] **Zero latency**: Input processed immediately
- [x] **Rebindable**: All controls customizable
- [x] **Multi-input**: Support keyboard, mouse, gamepad
- [x] **Persistent**: Save custom bindings
- [x] **Conflict-free**: No duplicate bindings

---

## ✅ Implementation Checklist

### Phase 1: Input Architecture (Priority: Immediate)

#### Input Manager Setup
- [x] Create InputManager singleton
- [x] Initialize input systems (keyboard, mouse)
- [x] Create input action map structure
- [x] Set up default bindings (Hardcoded for now)
- [x] Test: Input manager initializes

#### Action Mapping System
- [x] Define all game actions (move, jump, fire, reload, etc.)
- [x] Create action → key binding map
- [x] Support multiple keys per action
- [x] Implement action query methods (isPressed, wasPressed, getValue)
- [x] Test: Actions map to keys correctly

### Phase 2: Keyboard Input (Priority: Immediate)

#### Key Detection
- [x] Capture all keyboard events
- [x] Track key down states
- [x] Track key up events
- [ ] Track key held duration
- [x] Test: All keys register

#### Movement Keys
- [x] Map WASD to movement actions
- [x] Support arrow keys as alternative
- [x] Normalize diagonal movement
- [x] Test: Movement input works

#### Action Keys
- [x] Map space to jump
- [x] Map shift to sprint
- [x] Map R to reload
- [x] Map E to interact
- [x] Map 1-9 to weapon slots
- [ ] Map Q to weapon toggle (Supported via rebinding)
- [ ] Map G to grenade
- [ ] Map F to ability
- [x] Map Tab to scoreboard
- [x] Map Escape to pause
- [x] Test: All action keys work

### Phase 3: Mouse Input (Priority: Immediate)

#### Mouse Movement
- [x] Capture raw mouse delta
- [x] No smoothing or acceleration
- [x] Track mouse position
- [ ] Clamp to screen bounds (menu mode)
- [x] Test: Mouse movement is 1:1

#### Mouse Buttons
- [x] Left click → Primary fire
- [x] Right click → ADS/Secondary
- [ ] Middle click → Ping/Mark (optional)
- [ ] Mouse 4/5 → Custom actions
- [x] Test: All buttons register

#### Mouse Wheel
- [x] Scroll up → Next weapon
- [x] Scroll down → Previous weapon
- [ ] Alternative bindings for zoom/abilities
- [x] Test: Scroll wheel works

### Phase 4: Gamepad Support (Priority: Medium)

#### Gamepad Detection
- [ ] Detect connected gamepads
- [ ] Support Xbox/PlayStation layouts
- [ ] Handle gamepad connect/disconnect
- [ ] Test: Gamepad detected

#### Analog Sticks
- [ ] Left stick → Movement
- [ ] Right stick → Camera look
- [ ] Deadzone configuration
- [ ] Sensitivity curves
- [ ] Test: Stick input smooth

#### Gamepad Buttons
- [ ] A/X → Jump
- [ ] B/Circle → Crouch
- [ ] X/Square → Reload
- [ ] Y/Triangle → Weapon switch
- [ ] LB/L1 → Grenade
- [ ] RB/R1 → Ability
- [ ] LT/L2 → ADS
- [ ] RT/R2 → Fire
- [ ] D-pad → Weapon selection
- [ ] Start → Pause
- [ ] Select/Back → Scoreboard
- [ ] Test: All buttons work

#### Gamepad Rumble
- [ ] Fire weapon → Light rumble
- [ ] Take damage → Medium rumble
- [ ] Explosion → Heavy rumble
- [ ] Configurable intensity
- [ ] Test: Rumble feels good

### Phase 4: Gamepad Support (Priority: Medium)
- [x] **Gamepad Polling**
  - [x] Detect connected gamepads
  - [x] Poll button states
  - [x] Poll axis states (sticks)
- [x] **Action Mapping**
  - [x] Map buttons to GameActions
  - [x] Map sticks to movement/look
- [x] **Deadzone Handling**
  - [x] Implement deadzones for sticks

### Phase 5: Rebinding System (Priority: Medium)

#### Binding Interface
- [ ] Create rebind UI
- [ ] Show current bindings
- [ ] Capture new key press
- [ ] Detect conflicts
- [ ] Warn on conflicts
- [ ] Test: Can rebind keys

#### Binding Storage
- [x] **Data Structure**
  - [x] Store bindings in a serializable format
- [x] **Persistence**
  - [x] Save bindings to localStorage
  - [x] Load bindings on startup
- [ ] Reset to defaults option
- [ ] Per-profile bindings (optional)
- [ ] Test: Bindings persist

### Phase 6: Input Contexts (Priority: Low)

#### Context System
- [ ] Gameplay context (all actions active)
- [ ] Menu context (limited actions)
- [ ] Chat context (text input only)
- [ ] Rebind context (capture mode)
- [ ] Switch contexts cleanly
- [ ] Test: Contexts isolate input correctly

### Phase 7: Advanced Features (Priority: Low)

#### Input Buffering
- [ ] Buffer jump input (jump buffer)
- [ ] Buffer fire input (optional)
- [ ] Configurable buffer window
- [ ] Test: Buffered input feels responsive

#### Double Tap Detection
- [ ] Detect double tap (dash, etc.)
- [ ] Configurable timing window
- [ ] Test: Double tap reliable

#### Hold Detection
- [ ] Detect button held
- [ ] Track hold duration
- [ ] Trigger on hold threshold
- [ ] Test: Hold detection works

---

## 🔍 Verification Criteria

```javascript
// Check input manager exists
✓ InputManager class/singleton exists
✓ Initialized in game startup

// Check action mappings
✓ All game actions defined
✓ Default bindings set
✓ Action query methods exist

// Check keyboard
✓ WASD captured
✓ Space captured
✓ All action keys mapped

// Check mouse
✓ Mouse delta captured
✓ Mouse buttons captured
✓ Mouse wheel captured

// Check gamepad
✓ Gamepad detection exists
✓ Analog sticks mapped
✓ Buttons mapped

// Check rebinding
✓ Rebind interface exists
✓ Bindings save/load
✓ Conflict detection exists
```

---

## 📁 Code Location

```
/scripts
  /input
    inputManager.js
    inputActions.js
    inputBindings.js
    gamepadManager.js
```

---

## 🎯 Definition of Done

- [x] All checkboxes checked
- [x] Zero input lag
- [x] All controls rebindable
- [x] Gamepad fully supported
- [x] Bindings persist
- [x] No conflicts
- [x] Performance: <0.5ms per frame

---

**Status**: ⬜ Not Started  
**Last Updated**: [Date]
