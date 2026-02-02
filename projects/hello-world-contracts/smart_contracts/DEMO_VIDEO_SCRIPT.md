# Demo Video Script - Protius State Machine

## 🎬 Video Structure (10 minutes)

### INTRO (1 min)
**Screen**: Title slide
**Narration**: 
> "Welcome to the Protius State Machine implementation. In this demo, I'll show you the 8-state lifecycle management system we've built, how it enforces project phases on-chain, and where you'll take it from here."

---

## PART 1: THE PROBLEM WE SOLVED (1 min)

### Scene 1: Before State Machine
**Screen**: Show old code without states
**Narration**:
> "Before this implementation, project lifecycle was implicit. You could record production before COD, mark FC finalized multiple times, or skip construction phases entirely. There was no canonical source of truth for 'where is this project in its lifecycle?'"

### Scene 2: After State Machine
**Screen**: Show state machine diagram from COMPLETE_LIFECYCLE.md
**Narration**:
> "Now, we have an explicit 8-state machine enforced on-chain:
> - DRAFT: Initial setup
> - REGISTERED: Ready for fundraising
> - FUNDED: Token sale complete
> - UNDER_CONSTRUCTION: EPC phase
> - COMMISSIONING: Testing phase
> - OPERATING: Main revenue-generating state
> - SUSPENDED: Temporary offline (maintenance)
> - EXITED: Decommissioned (terminal state)"

---

## PART 2: LIVE DEMO (5 min)

### Scene 3: LocalNet Setup
**Screen**: Terminal
**Commands**:
```bash
# Show it's running
docker ps | grep algod

# Show deployed contract
curl http://localhost:4001/v2/applications/1003 | jq '.params'
```

**Narration**:
> "I've already deployed the updated ProjectRegistry to LocalNet. App ID 1003 contains all the state machine fields."

### Scene 4: Open Operator Console
**Screen**: Browser → http://localhost:8080
**Click Path**: Operator Console

**Narration**:
> "At the top of the Operator Console, you'll see the new Project Status Panel. This component reads the current state from the blockchain in real-time and auto-refreshes every 10 seconds."

### Scene 5: State Panel Walkthrough
**Screen**: Zoom in on ProjectStatusPanel
**Point to each element**:

**Narration**:
> "The panel shows:
> 1. Current state with visual indicator (orange = DRAFT)
> 2. State timeline - all 8 states with progress
> 3. Allowed transitions - only valid next states are enabled
> 4. Timestamp of when we entered this state
> 5. Who the current operator is
> 
> Notice the 'Transition to REGISTERED' button is green and enabled, but 'Transition to FUNDED' is grayed out. You can't skip states."

### Scene 6: Show Contract Code
**Screen**: VS Code → project_registry/contract.algo.ts
**Scroll to**: Lines 200-250 (transitionState function)

**Narration**:
> "Here's the on-chain enforcement. The transitionState() function validates every move:
> - DRAFT can only go to REGISTERED
> - REGISTERED can only go to FUNDED (and only after FC finalized)
> - You can suspend from OPERATING and resume back
> - Only admin can EXIT a project
> 
> Each transition is logged on-chain with a timestamp."

### Scene 7: Show State Guards
**Screen**: Scroll to markCOD() function (line ~320)

**Narration**:
> "We've also added state guards to critical operations. For example, markCOD() can only be called when the project is in COMMISSIONING state. This prevents marking COD before construction is done."

**Highlight**:
```typescript
assert(this.projectState.value === Uint64(4), 'Must be in COMMISSIONING')
```

### Scene 8: Multi-Screen Integration
**Screen**: Show 3 browser tabs side-by-side
- Tab 1: Operator Console (read-write)
- Tab 2: Project Overview (read-only)
- Tab 3: Buyer Portal (read-only)

**Narration**:
> "The state panel is integrated into three screens:
> - Operator Console: Full controls, can trigger transitions
> - Project Overview: Read-only for investors
> - Buyer Portal: Read-only for PPA customers
> 
> Everyone sees the same canonical state, but only authorized users can change it."

---

## PART 3: WHAT'S DONE VS. TODO (2 min)

### Scene 9: Show Stub Code
**Screen**: ProjectStatusPanel.tsx, line ~130
**Highlight**:
```typescript
const handleTransition = async (newState: number) => {
  alert(`Transitioning to state ${newState}`)
  // TODO: Wire to actual contract call
}
```

**Narration**:
> "Currently, the transition buttons show an alert. This is where you come in."

### Scene 10: What You Need to Build
**Screen**: Show TODO comments

**Narration**:
> "Phase 2 tasks for your team:
> 
> 1. **Wallet Integration**: Add Pera or Defly wallet connection
> 2. **Wire Transitions**: Replace the alert with:
>    ```typescript
>    const txn = await registryClient.transitionState({ newState })
>    const signedTxn = await wallet.signTransaction(txn)
>    await algod.sendRawTransaction(signedTxn).do()
>    ```
> 3. **Test Full Flow**: Walk through all 8 states on LocalNet
> 4. **Error Handling**: Show nice errors when transitions fail
> 5. **Loading States**: Add spinners during blockchain calls"

### Scene 11: Testing Checklist
**Screen**: STATE_MACHINE_GUIDE.md, testing section

**Narration**:
> "Your testing checklist:
> ✅ Test valid transitions (9 allowed paths)
> ❌ Test invalid transitions (should fail)
> ✅ Test COD in wrong state (should fail)
> ✅ Test operator can't EXIT
> ✅ Test suspend/resume cycle
> ✅ Test state guards on markCOD() and markFCFinalised()"

---

## PART 4: CRITICAL INFO (1 min)

### Scene 12: The Enum Limitation
**Screen**: Show compiler error from earlier

**Narration**:
> "⚠️ CRITICAL DISCOVERY: Algorand TypeScript doesn't support enums!
> 
> We tried this:
> ```typescript
> enum ProjectState { DRAFT = 0, REGISTERED = 1 }
> ```
> 
> But the compiler fails with 'Unsupported syntax visitor EnumDeclaration'.
> 
> So we use literal numbers with comments:
> ```typescript
> // State 0 = DRAFT
> // State 1 = REGISTERED
> projectState.value = Uint64(0)
> ```
> 
> Make sure your team knows this limitation when working with the contract!"

### Scene 13: File Locations
**Screen**: VS Code file tree

**Narration**:
> "Key files to review:
> - `/project_registry/contract.algo.ts` - The smart contract
> - `/web/src/ProjectStatusPanel.tsx` - The UI component
> - `/STATE_MACHINE_GUIDE.md` - Implementation decisions
> - `/TEAM_SETUP.md` - Setup instructions
> - `/COMPLETE_LIFECYCLE.md` - Updated with state machine
> 
> Everything is documented and ready for handoff."

---

## CLOSING (30 sec)

### Scene 14: Summary
**Screen**: Back to browser showing the state panel

**Narration**:
> "To recap:
> ✅ 8-state lifecycle is live on LocalNet
> ✅ UI components are built and integrated
> ✅ Contract enforces valid transitions
> ✅ Documentation is complete
> 
> Next steps: Follow TEAM_SETUP.md, get LocalNet running, and start Phase 2 - wiring the UI buttons to actual blockchain transactions.
> 
> Questions? Check the docs or reach out. Good luck!"

**Screen**: Fade to Protius logo

---

## 📹 RECORDING TIPS

### Screen Recording Setup
- **Resolution**: 1920x1080
- **Tool**: OBS Studio or Loom
- **Browser Zoom**: 125% for visibility
- **Terminal Font**: 14pt minimum
- **VS Code Font**: 16pt for code
- **Mouse Highlight**: Enable for pointer visibility

### Camera/Audio
- **Mic**: Clear audio, reduce background noise
- **Pace**: Speak slowly, pause between sections
- **Rehearse**: Do a dry run first

### Editing
- **Chapters**: Add timestamps for each section
  - 0:00 - Intro
  - 1:00 - Problem We Solved
  - 2:00 - Live Demo
  - 7:00 - What's Done vs TODO
  - 9:00 - Critical Info
  - 9:30 - Closing

- **Overlays**: Add text overlays for:
  - "⚠️ No Enum Support"
  - "✅ App ID: 1003"
  - "📝 See TEAM_SETUP.md"

### Distribution
- **Format**: MP4, H.264
- **Upload**: Loom, YouTube (unlisted), or internal wiki
- **Thumbnail**: Screenshot of state panel
- **Description**: Link to TEAM_SETUP.md and STATE_MACHINE_GUIDE.md

---

## 🎯 ALTERNATIVE: QUICK LOOM (5 MIN VERSION)

If short on time, record a 5-minute Loom:

**Part 1 (2 min)**: Problem + Solution
- Show state machine diagram
- Show deployed contract

**Part 2 (2 min)**: UI Demo
- Open Operator Console
- Walk through state panel
- Click around (even if stubs)

**Part 3 (1 min)**: Next Steps
- "See TEAM_SETUP.md"
- "Phase 2: Wire the buttons"
- "Watch out for enum limitation"

**Done!** Share Loom link + TEAM_SETUP.md

---

## 📧 EMAIL TO TEAM

Subject: **Protius State Machine - Ready for Phase 2**

Hi team,

I've implemented the Project State Machine for Protius. Here's what you're getting:

**🎉 What's Live:**
- 8-state lifecycle (DRAFT → OPERATING → EXITED)
- On-chain enforcement in ProjectRegistry
- UI component showing real-time state
- Integrated into 3 screens
- Full documentation

**📹 Demo Video:**
[Link to recording] (10 minutes - watch this first!)

**📚 Key Docs:**
- [TEAM_SETUP.md](./TEAM_SETUP.md) - Get started in 5 minutes
- [STATE_MACHINE_GUIDE.md](./STATE_MACHINE_GUIDE.md) - Design decisions
- [COMPLETE_LIFECYCLE.md](./COMPLETE_LIFECYCLE.md) - Updated business flow

**🚀 Your Phase 2 Tasks:**
1. Add wallet integration (Pera/Defly)
2. Wire UI transition buttons to actual contract calls
3. Test complete state flow
4. Add error handling & loading states

**⚠️ CRITICAL:** Algorand TypeScript doesn't support enums! States are literal numbers 0-7. See contract comments.

**🆔 LocalNet Info:**
- ProjectRegistry App ID: 1003
- Deployer: ISR5CAAAKXMRJ6G5YD2O24AGKF32XEBXXWGYESQ3BQA4OH7WUIBFTY47EA

**Questions?** Check the docs first, then ping me.

Let's ship this! 🚀

[Your name]
