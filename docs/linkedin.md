# LinkedIn Post — Concourse

> Copy only the **Post copy** section into LinkedIn. Keep the checklist for publishing.

## Post copy

What if a stadium app could do more than show a static map?

A fan may need a step-free route, a quieter path, help reading a sign, or a way around a busy concourse—all while the event is moving around them.

I built **Concourse**, a context-aware smart-stadium companion for **PromptWars Virtual — Challenge 4** in the **Smart Stadiums & Tournament Operations** vertical.

It combines:

- a Qwen-backed concierge grounded in structured venue tools;
- deterministic A* indoor routing across a bundled MetLife venue graph, with fastest, step-free, sensory-safe, and low-crowd modes;
- accessibility support including large text, reduced motion, live captions, and sign reading; and
- a protected demo-operator console where a simulated route advisory or crowd override becomes a fan-facing alert, and can refresh the displayed demo route.

One design choice mattered most: **the crowd feed is simulated and clearly labelled as simulated.** This prototype does not claim live stadium telemetry. The goal was to demonstrate how transparent crowd conditions, accessibility preferences, venue data, and operational updates can produce a better next decision for a fan.

Building this pushed me to think about where AI should explain and where deterministic systems should decide: the model helps communicate; typed tools and routing logic provide the venue facts.

I’d love feedback from builders, accessibility advocates, and people working on live-event operations.

Repository: https://github.com/ArpitKumar8649/Smart-Stadium

@googlefordevelopers @hack2skill

#BuildwithAI #PromptWarsVirtual #Challenge4 #SmartStadium #Accessibility #GenerativeAI

---

## Publishing checklist

- [ ] Add one current screenshot or short video showing an operator incident/crowd action and the corresponding fan-facing alert or route experience.
- [ ] **Suggested alt text:** “Concourse smart-stadium prototype showing a fan navigation view alongside an operator console used to publish a demo venue alert.”
- [ ] Verify the repository is public: https://github.com/ArpitKumar8649/Smart-Stadium
- [x] Live demo verified: https://concourse-stadium.web.app (including the `/navigate` deep link). Recheck it in a private browser session immediately before publishing.
- [ ] Add an optional demo-video URL only after it is publicly available.
- [ ] Keep the mentions and required hashtags exactly once: `@googlefordevelopers`, `@hack2skill`, `#BuildwithAI`, `#PromptWarsVirtual`, and `#Challenge4`.
