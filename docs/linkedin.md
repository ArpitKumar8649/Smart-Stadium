# LinkedIn Post — Concourse

> Copy only the **Post copy** section into LinkedIn. Keep the checklist for publishing.

## Post copy

What do you do when 82,000 fans pour into a stadium — many in a language they don’t share with the venue, some needing a step-free route, others trying to avoid a crushing concourse — and the event keeps moving around them?

Static maps can’t answer that. FAQ pages can’t answer that. Even the best mobile app falls apart the moment an operational change happens mid-journey.

So I built **Concourse** — a context-aware smart-stadium companion — for **PromptWars Virtual — Challenge 4** (Smart Stadiums & Tournament Operations), targeting the FIFA World Cup 2026 Final at MetLife Stadium.

One companion that understands a fan’s language, body, route preference, and what’s happening in the building right now — and turns all of it into a useful *next decision*.

🏟️ **Qwen-backed concierge, grounded in real venue tools.** The model doesn’t guess where the nearest restroom is — it calls a bounded tool loop over a bundled MetLife graph (3,479 nodes, 8,167 edges), streamed in one of ten languages. The AI explains; deterministic tools decide.

🧭 **Indoor wayfinding with a personality.** A* routing runs in four modes — fastest, step-free, sensory-safe, low-crowd. A fan needing an elevator, one avoiding stairs, one overstimulated — each gets a different path through the same building.

📊 **Crowd-aware decisions, honestly labelled.** The crowd feed is simulated and visibly labelled — a prototype shouldn’t pretend to be live telemetry. The goal: show how transparent density forecasts, accessibility needs, and operational updates compose into a better next step.

♿ **Accessibility, first-class not a checkbox.** Large text, reduced motion, live captions, a camera sign-reader workflow for fans who can’t read the venue’s signs, step-free and sensory-safe routing — all wired into the same pathfinding engine everyone uses.

⚡ **Real-time operator-to-fan loop.** A protected demo-operator console injects a route advisory or crowd override; the fan’s phone gets it via Server-Sent Events, excludes the affected node, and refreshes the route automatically. No polling, no page reloads.

📱 **Built for the phone on stadium Wi-Fi.** Route-level lazy loading, deferred 3D, cached map assets, mobile GPU quality tiers that scale render resolution down on low-power handsets. A React PWA on Firebase Hosting, talking to an Express API on Azure.

The hardest question wasn’t any single feature — it was drawing the line between what the model should *explain* and what deterministic code should *decide*. Venue facts come from typed tools and a routing engine; the model makes them legible in a fan’s language, at the moment they need them.

Where would you draw that line — what should an LLM never be allowed to decide in any live-event system?

Live demo: https://concourse-stadium.web.app
Repository: https://github.com/ArpitKumar8649/Smart-Stadium

@googlefordevelopers @hack2skill

#BuildwithAI #PromptWarsVirtual #Challenge4 #SmartStadium #Accessibility #GenerativeAI #Qwen

---

## Publishing checklist

- [ ] Add one current screenshot or short video showing an operator incident/crowd action and the corresponding fan-facing alert or route experience.
- [ ] **Suggested alt text:** “Concourse smart-stadium prototype showing a fan navigation view alongside an operator console used to publish a demo venue alert.”
- [ ] Verify the repository is public: https://github.com/ArpitKumar8649/Smart-Stadium
- [x] Live demo verified: https://concourse-stadium.web.app (including the `/navigate` deep link). Recheck it in a private browser session immediately before publishing.
- [ ] Add an optional demo-video URL only after it is publicly available.
- [ ] Keep the mentions and required hashtags exactly once: `@googlefordevelopers`, `@hack2skill`, `#BuildwithAI`, `#PromptWarsVirtual`, and `#Challenge4`.
