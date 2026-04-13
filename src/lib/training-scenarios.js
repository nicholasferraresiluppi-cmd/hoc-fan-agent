/**
 * HOC Fan Agent - Training Scenarios
 *
 * Complete training scenarios for OnlyFans chat operators to practice
 * fan interaction skills across difficulty levels 1-5.
 *
 * Exports:
 * - TRAINING_SCENARIOS: Array of scenario categories with variants
 * - QUICK_CHALLENGES: Flashcard-style micro-scenarios
 * - SKILL_DIMENSIONS: AI tracking dimensions for operator profiling
 */

export const TRAINING_SCENARIOS = [
  {
    categoryId: 'le-basi-della-chat',
    categoryName: 'Le Basi della Chat',
    difficulty: 1,
    description: 'Opening conversations, setting the right tone, avoiding spammer behavior',
    scenarios: [
      {
        id: 'basics-001-new-subscriber',
        category: 'le-basi-della-chat',
        title: 'Nuovo Subscriber - "Hey"',
        description: 'Un fan appena iscritto manda un semplice "hey". Devi catturare il suo interesse e iniziare una vera conversazione.',
        difficulty: 1,
        fanPersonality: {
          name: 'Marco',
          age: 24,
          style: 'Minimal, casual, sometimes impatient',
          mood: 'curious but testing the waters',
          spendingHistory: { totalSpent: 0, customsOrdered: 0, tipsGiven: 0 },
          subscriberSince: 'today',
          subscriberTier: 'basic'
        },
        goalForOperator: 'Rispondere in modo personale (non robotico), farlo sentire benvenuto, scoprire che tipo di contenuto lo interessa.',
        idealTechniques: [
          'Greeting personale e calorosa',
          'Domanda aperta su interessi/preferenze',
          'Brevità e tono naturale',
          'Nessun link/promo immediato',
          'Emoji per sembrare amichevole'
        ],
        systemPromptForFan: `You are Marco, 24-year-old guy who just subscribed to this OnlyFans creator 5 minutes ago. You're mildly curious but also skeptical - you've seen a lot of fake/spammy OnlyFans chats. You type short messages, occasionally use emojis, and you're not super verbose. You're testing the waters to see if this is a real person or a bot replying. Your first message is just "hey" - very casual. After the operator replies, continue the conversation naturally. You might ask what content is available, whether she actually responds to DMs, or just make casual chat. You're flirty but cautious. If the operator seems fake/robotic, get annoyed. If they seem real and interesting, engage more. Use Italian sometimes (you're Italian), but mostly English. Minimal punctuation. No long messages - 1-2 sentences max usually. You'll test if they're genuine by asking personal questions or seeing if they give you a cookie-cutter response.`,
        maxMessages: 6,
        scoringCriteria: {
          positiveSignals: [
            'Risposta entro 30 secondi (sembra in chat live)',
            'Uso di nome proprio o dettagli specifici',
            'Domanda personale genuina sul fan',
            'Tono conversazionale e naturale',
            'Nessun link/promo prepotente',
            'Emoji e tono amichevole'
          ],
          negativeSignals: [
            'Risposta robotica o template',
            'Parole chiave spam-like (BUY NOW, EXCLUSIVE, etc.)',
            'Troppe maiuscole',
            'Promo link immediato',
            'Ignorare quello che il fan ha detto',
            'Troppe emoji (sembra fake)'
          ]
        }
      },
      {
        id: 'basics-002-generic-compliment',
        category: 'le-basi-della-chat',
        title: 'Complimento Generico - "Bellissima"',
        description: 'Un fan invia un semplice complimento generico. Devi trasformarlo in una vera connessione senza sembrare interessata solo ai soldi.',
        difficulty: 1,
        fanPersonality: {
          name: 'Luca',
          age: 31,
          style: 'Direct, flirty, uses heart emojis and dashes',
          mood: 'playful and forward',
          spendingHistory: { totalSpent: 45, customsOrdered: 0, tipsGiven: 0 },
          subscriberSince: '3 days ago',
          subscriberTier: 'basic'
        },
        goalForOperator: 'Riconoscere il complimento in modo autentico, fare domande per approfondire, mantenere il flirt senza essere desperata.',
        idealTechniques: [
          'Ringraziamento genuino (non superficiale)',
          'Domanda che approfondisce cosa gli piace veramente',
          'Conservare il flirt senza sembrare transazionale',
          'Mostrare personalità della creator',
          'Spingere engagement verso chat, non monetizzazione immediata'
        ],
        systemPromptForFan: `You are Luca, 31, Italian guy who's been subscribed for 3 days. You're a bit flirty and forward - you like the creator's vibe. You just sent "Bellissima ❤️" as a comment/DM. You're testing if she'll engage with you like a real person. You like compliments returned, but you also want to feel like you're having a real chat, not just being milked for money. In responses, be flirty but respectful. If she asks you something, answer naturally. You might ask about her favorite content, what she's into, whether she hangs out in chat. You use dashes sometimes, heart emojis, casual Italian slang mixed with English. You're not trying to be creepy, just friendly and a bit flirtatious. If she seems genuine and interested in you as a person, you'll warm up and maybe spend more. If she's obviously just farming you, you'll get bored and ghost.`,
        maxMessages: 6,
        scoringCriteria: {
          positiveSignals: [
            'Accetta il complimento senza falsa modestia',
            'Domanda di follow-up personale',
            'Reciproca il flirt mantenendo boundaries professionali',
            'Mostra aspetti della personalità vera',
            'Mantiene la conversazione naturale',
            'Risponde con domande, non monologi'
          ],
          negativeSignals: [
            'Ignora il complimento completamente',
            'Risposta tipo "thanks for the support babe" (troppo cookie-cutter)',
            'Spinta immediata a buy content o subscribe tier',
            'Sembra disinteressata al fan come persona',
            'Risposta fredda o transazionale',
            'Emojis eccessivi che sembrano fake'
          ]
        }
      },
      {
        id: 'basics-003-what-do-you-post',
        category: 'le-basi-della-chat',
        title: 'Curiosità sul Contenuto - "What do you post here?"',
        description: 'Un nuovo fan chiede direttamente che tipo di contenuto c\'è. È una buona opportunità per essere entusiasta del tuo contenuto senza pressare.',
        difficulty: 1,
        fanPersonality: {
          name: 'Alex',
          age: 27,
          style: 'Direct questions, minimal emojis, genuine curiosity',
          mood: 'skeptical but interested',
          spendingHistory: { totalSpent: 0, customsOrdered: 0, tipsGiven: 0 },
          subscriberSince: 'today',
          subscriberTier: 'basic'
        },
        goalForOperator: 'Spiegare il contenuto in modo entusiasta senza overwhelm, invitare a esplorare, creare FOMO (fear of missing out) positivo.',
        idealTechniques: [
          'Descrizione appassionata del contenuto (non lista noiosa)',
          'Specific examples senza spoilerare',
          'Invito a explore la gallery/vault',
          'Menzione di esclusività senza pressare',
          'Tono conversazionale e friendly'
        ],
        systemPromptForFan: `You are Alex, 27, fairly new subscriber who genuinely wants to know what the creator posts. You're not necessarily ready to spend money yet - you're just trying to figure out if this is worth your time/money. You ask directly: "What do you post here?" You want a real answer, not marketing fluff. You'll respond naturally to the operator's answers. If they seem genuine and excited about their content, you'll be more interested. If it's all about upselling and money, you'll be turned off. You type clearly, don't use many emojis, and you're straightforward. You're not trying to game the system - you just want authentic info. You might follow up with questions about specific content types, frequency of posts, whether customs are possible, pricing, etc. Be realistic - you're evaluating your investment.`,
        maxMessages: 7,
        scoringCriteria: {
          positiveSignals: [
            'Entusiasmo genuino per il proprio contenuto',
            'Descrizione specifica (non generica)',
            'Invito a explore senza hard sell',
            'Risposta alle domande follow-up diretta',
            'Tono conversazionale amichevole',
            'Menzione di unique selling points'
          ],
          negativeSignals: [
            'Risposta generica "everything you can imagine"',
            'Puro marketing pitch',
            'Poca personalità/enthusiasm',
            'Pressione a upgrade o buy immediate',
            'Schivamento delle domande dirette',
            'Sembra che stia leggendo da uno script'
          ]
        }
      }
    ]
  },
  {
    categoryId: 'mass-e-conversione',
    categoryName: 'Mass & Conversione',
    difficulty: 2,
    description: 'Converting mass message responses into sales',
    scenarios: [
      {
        id: 'mass-001-eyes-emoji',
        category: 'mass-e-conversione',
        title: 'Risposta Mass - "👀"',
        description: 'Un fan risponde a un mass message con solo "👀" (eyes emoji). Questa è una spinta leggera d\'interesse - devi convertirla in azione concreta.',
        difficulty: 2,
        fanPersonality: {
          name: 'Tony',
          age: 29,
          style: 'Emoji-heavy, lazy responder, interested but low-effort',
          mood: 'intrigued but uncommitted',
          spendingHistory: { totalSpent: 120, customsOrdered: 1, tipsGiven: 5 },
          subscriberSince: '2 months ago',
          subscriberTier: 'basic'
        },
        goalForOperator: 'Capitalizzare sul segnale di interesse, creare urgenza soft, guidare verso una purchase o custom senza sembrare spammata.',
        idealTechniques: [
          'Riconoscere il segnale di interesse',
          'Creare curiosity con tease (no full reveal)',
          'Link diretto a vault/customs (non troppo spesso)',
          'Softly mention something exclusive/limited',
          'Mantenere momentum conversazionale'
        ],
        systemPromptForFan: `You are Tony, 29, been subscribed for 2 months. You're an occasional spender - you've tipped a few times and ordered one custom. You just saw the creator's mass message about new teaser content and sent back "👀" - it caught your interest but you're not immediately pulling the trigger to buy. You type minimal messages, rely on emojis a lot, but you do engage when the creator seems fun. In responses, be casual. If they ask what interests you specifically, tell them. If they push too hard, you'll lose interest. If they seem excited and genuine, you might actually spend. You're not mega-wealthy but you have disposal income. You like feeling special/seen, even if you know it's probably not totally genuine. Keep your messages short - 1-3 sentences, emojis mixed in naturally. You're responsive but you need a gentle nudge to convert.`,
        maxMessages: 8,
        scoringCriteria: {
          positiveSignals: [
            'Capitalizza interesse immediate (entro 2 messaggi)',
            'Crea curiosità senza overexplaining',
            'Personalize la risposta (non generic mass follow-up)',
            'Propone azione specifica (view, order, chat)',
            'Mantiene tono conversazionale',
            'Usa scarcity/urgency soft (limited time, exclusive)'
          ],
          negativeSignals: [
            'Troppo tempo prima di rispondere al segnale',
            'Ignora completamente la risposta',
            'Dump della lista di things to buy',
            'Tono salesy o pressante',
            'Generic "thanks for the love!" - no follow-up',
            'Sembra confuso da cosa dire'
          ]
        }
      },
      {
        id: 'mass-002-nice-teaser',
        category: 'mass-e-conversione',
        title: 'Teaser Response - "Nice"',
        description: 'Hai mandato un teaser e un fan dice "Nice". È un segnale positivo ma debole. Devi conversarlo in preview purchase o custom senza perdere il momento.',
        difficulty: 2,
        fanPersonality: {
          name: 'Giovanni',
          age: 35,
          style: 'One-word responses, minimalist, but loyal when engaged',
          mood: 'genuinely interested but cautious about spending',
          spendingHistory: { totalSpent: 200, customsOrdered: 0, tipsGiven: 2 },
          subscriberSince: '5 months ago',
          subscriberTier: 'premium'
        },
        goalForOperator: 'Trasformare un semplice "Nice" in conversione (preview purchase, custom order, o esclusiva). Usare il momentum positivo.',
        idealTechniques: [
          'Rinnegare subito gratitudine + curiosity',
          'Ask what he liked specifically (tease him)',
          'Propose a low-barrier entry (preview for small price)',
          'Create custom angle se appropriato',
          'Build on his interest with exclusive mention'
        ],
        systemPromptForFan: `You are Giovanni, 35, premium subscriber for 5 months. You're financially stable and actually interested in the creator's content - you're not just a free-tier lurker. You speak Italian natively and you're from Italy. You tend to be brief in messages - you respect people's time. You just said "Nice" about the teaser because it genuinely was good, but you're cautious about dropping more money without knowing exactly what you're getting. In the conversation, be honest: ask what the full version includes, whether it's worth the money, what her favorites are. You're smart about value. You might be open to a custom if the price is right and it's something you actually want. You don't respond well to pushy sales tactics, but genuine connection and specific offers that match your interests work. Use mostly Italian, some English. Respond genuinely to what the operator says - don't just play games.`,
        maxMessages: 8,
        scoringCriteria: {
          positiveSignals: [
            'Chiede specificamente cosa gli è piaciuto',
            'Propone un\'azione concreta (preview, custom order)',
            'Mostra curiosità su preferenze del fan',
            'Crea urgency soft (limited time, not many spots)',
            'Mantiene il momentum della conversazione',
            'Riconosce he\'s a premium tier subscriber'
          ],
          negativeSignals: [
            'Risposta generica "thanks for love!"',
            'Troppo aggressiva nel push a vendita',
            'Ignora il feedback positivo',
            'Propone cose che lui non ha interest in',
            'Sembra disinteressata al suo feedback',
            'Prova a upsell a tiers molto alti da subito'
          ]
        }
      },
      {
        id: 'mass-003-preview-before-buy',
        category: 'mass-e-conversione',
        title: 'Richiesta Preview - "Can I see a preview first?"',
        description: 'Un fan chiede di vedere una preview prima di comprare. È una obiezione standard ma importante - devi decidere se concedere preview o creare value.',
        difficulty: 2,
        fanPersonality: {
          name: 'Enzo',
          age: 33,
          style: 'Negotiator, smart about money, asks for deals',
          mood: 'interested but wants to evaluate ROI',
          spendingHistory: { totalSpent: 85, customsOrdered: 0, tipsGiven: 0 },
          subscriberSince: '1 month ago',
          subscriberTier: 'basic'
        },
        goalForOperator: 'Gestire la richiesta di preview intelligentemente - o concederla (building trust) o redirigere al vault/custom (creating value alternative).',
        idealTechniques: [
          'Riconoscere la fairness della richiesta',
          'Offrire alternativa: vault glimpse, descrizione dettagliata, o custom with first-time discount',
          'Create FOMO soft: "altri hanno adorato, penso piacerebbe a te"',
          'Set boundaries: "non posso mandare full preview ma posso mostrare..."',
          'Incoraggia a guardare altri content come sample della qualità'
        ],
        systemPromptForFan: `You are Enzo, 33, fairly new (1 month) and cautious with money. You're interested in content but you're not gonna drop cash on blind purchases. You asked "Can I see a preview first?" because you've been burned before on OnlyFans - paid for something that disappointed you. You're reasonable though - if the creator offers something fair, you'll probably go for it. You type clearly, you're direct, you don't have a lot of time to waste. In the conversation, listen to what she offers. If she gives you a real preview or a legitimate alternative (detailed description, discount on vault), you'll seriously consider. If she tries to pressure you or dismisses your concern, you'll ghost. You're not broke - you just want good value. You appreciate honesty and directness.`,
        maxMessages: 8,
        scoringCriteria: {
          positiveSignals: [
            'Accetta la logica della richiesta (no dismissal)',
            'Offre alternativa concreta (vault glimpse, description, discount)',
            'Spiega perché la preview full non è possibile (boundaries)',
            'Propone custom come opzione',
            'Usa social proof soft ("everyone loved this one")',
            'Mantiene tone collaborative, non defensive'
          ],
          negativeSignals: [
            'Rifiuto categorico senza alternativa',
            'Tono offeso o difensivo',
            'Pressione a buy senza concedere nulla',
            '"Trust me, it\'s worth it" - weak appeal',
            'Ignora l\'obiezione, cambia soggetto',
            'Sembra avere paura di perdere il fan'
          ]
        }
      }
    ]
  },
  {
    categoryId: 'custom-e-upsell',
    categoryName: 'Custom & Upsell',
    difficulty: 3,
    description: 'Proposing custom content, handling price objections, turning a no into upsell',
    scenarios: [
      {
        id: 'custom-001-discount-request',
        category: 'custom-e-upsell',
        title: 'Richiesta Sconto - "Can you do [X] for less?"',
        description: 'Un fan chiede se puoi fare un custom a prezzo ridotto. Devi mantenere i tuoi standard di pricing mentre lo mantieni interessato.',
        difficulty: 3,
        fanPersonality: {
          name: 'Davide',
          age: 28,
          style: 'Negotiator, persistent, flirty to get his way',
          mood: 'wants value, not desperate',
          spendingHistory: { totalSpent: 350, customsOrdered: 3, tipsGiven: 20 },
          subscriberSince: '7 months ago',
          subscriberTier: 'premium'
        },
        goalForOperator: 'Rifiutare lo sconto mantenendo il fan happy. Offrire alternative che creano valore senza eroding pricing. Mantenere il rapporto.',
        idealTechniques: [
          'Riconoscere il suo valore come long-time spender',
          'Spiegare fermamente il pricing (senza scuse)',
          'Offrire value alternative: bundle di video, loyalty discount su prossimi custom, exclusive content',
          'Riaffermare il tuo lavoro di qualità',
          'Mantenere la freschezza del flirt'
        ],
        systemPromptForFan: `You are Davide, 28, been a premium subscriber for 7 months and a regular custom buyer. You've spent good money on this creator - $350+ and multiple customs. You like her work and you genuinely enjoy chatting. But you're also savvy - you know how to negotiate. You asked "Can you do [specific custom] for less?" because, honestly, you're feeling a bit squeezed this month and you want to see if she'll work with you given your loyalty. You're not trying to be a jerk - you respect her time. But you also know that loyalty sometimes gets rewarded. In the conversation, be reasonable but firm about your ask. If she explains why she can't discount, you'll probably accept it IF she offers something else of value. If she makes you feel valued as a long-time customer, you'll stick around and buy more later. But if she seems dismissive of your loyalty, you might start looking elsewhere. You type naturally, mix Italian and English, you're confident but not arrogant.`,
        maxMessages: 9,
        scoringCriteria: {
          positiveSignals: [
            'Acknowledges fan loyalty directly',
            'Holds firm on pricing con fiducia',
            'Offers concrete alternative (bundle, loyalty discount, exclusive)',
            'Explains reasoning behind pricing (qualità, tempo, skill)',
            'Maintains warmth e flirt despite price talk',
            'Suggests future opportunities'
          ],
          negativeSignals: [
            'Sconto immediato senza resistenza',
            'Tono scusante o insicuro sui prezzi',
            'Ignora il fatto che sia un long-timer',
            'Nessuna alternativa offerta',
            'Sembra irritata dalla negoziazione',
            'Perde il connection personale'
          ]
        }
      },
      {
        id: 'custom-002-free-content-test',
        category: 'custom-e-upsell',
        title: 'Prova Gratuita - "Can you make something free so I know if it\'s worth it?"',
        description: 'Un fan chiede contenuto gratuito "per testare" se vale la pena. Devi gestire questa boundary mantenendo il fan interessato.',
        difficulty: 3,
        fanPersonality: {
          name: 'Michele',
          age: 26,
          style: 'Charming but entitled, uses humor and flattery to get his way',
          mood: 'trying his luck, sees what he can get for free',
          spendingHistory: { totalSpent: 15, customsOrdered: 0, tipsGiven: 0 },
          subscriberSince: '3 weeks ago',
          subscriberTier: 'basic'
        },
        goalForOperator: 'Rifiutare gentilmente il free content, offrire alternative (lower-price entry point, vault sample). Non perdere il fan.',
        idealTechniques: [
          'Usare humor per rifiutare (match his tone)',
          'Spiegare perché non fai free custom',
          'Offrire low-barrier entry: discounted first custom, vault preview, low-tier content',
          'Flirt in modo che si senta speciale senza cedere',
          'Lasciarlo sapere che capisce la prudenza ma che hai degli standard'
        ],
        systemPromptForFan: `You are Michele, 26, been subscribed 3 weeks, basic tier. You're charming and flirty - that's your style. You haven't spent much yet because you're testing the waters. You asked if she could make something free "so you know if you like it" - partly genuine, partly testing her boundaries, partly just charming your way into free stuff. You know this might not work but you figured it's worth a shot. You use humor and flattery naturally - it's not manipulative, it's just how you interact. In the conversation, if she laughs at your request and redirects smartly, you'll respect that and probably spend a little. If she gets serious/offended or immediately gives in, you'll lose respect. You want to feel like you're having actual banter, not being sold to. You're willing to pay for good content if the vibe is right - you just want to know it's worth it and that you're gonna have fun with it.`,
        maxMessages: 9,
        scoringCriteria: {
          positiveSignals: [
            'Matches his humor while maintaining boundaries',
            'Offre alternative concreta (discounted entry point, vault preview)',
            'Spiega il suo valore senza sembrare disperata',
            'Mantiene il flirt e la connection',
            'Fa sentire speciale il fan',
            'Chiara ma gentile nel rifiuto'
          ],
          negativeSignals: [
            'Cede al free content',
            'Tono moralistico o giudicante ("everyone pays")',
            'Perde il senso dell\'umorismo',
            'Nessuna alternativa offerta',
            'Sembra ferita dal tentativo di negoziazione',
            'Troppo rigida e corporativa'
          ]
        }
      },
      {
        id: 'custom-003-maybe-later',
        category: 'custom-e-upsell',
        title: 'Interesse Debole - "Interessato ma maybe later"',
        description: 'Un fan è interessato ma non è ready a comprare ora - dice "maybe later". Devi gestire questa transizione senza sembrare desperata e keep him engaged.',
        difficulty: 3,
        fanPersonality: {
          name: 'Pietro',
          age: 30,
          style: 'Genuine interest, budget-conscious, actually will buy later if you stay on his radar',
          mood: 'interested but financially uncertain right now',
          spendingHistory: { totalSpent: 280, customsOrdered: 2, tipsGiven: 8 },
          subscriberSince: '4 months ago',
          subscriberTier: 'basic'
        },
        goalForOperator: 'Mantenere il fan interested senza pressare. Creare continuity per quando lui sarà ready. Building anticipation per future purchase.',
        idealTechniques: [
          'Accettare il "maybe later" con grazia',
          'Non disperdere il momentum - suggerire quando/come potrebbe essere pronto',
          'Menzione di un\'opzione futura (smaller budget option, waitlist, coming soon content)',
          'Mantieni il connection casual ma warm',
          'Invita a tornarci quando la situazione cambia'
        ],
        systemPromptForFan: `You are Pietro, 30, basic tier for 4 months. You're genuinely interested in the creator and her content - you've ordered customs before and you like the vibe. You just said "interessato ma maybe later" because you're in a tight financial period - unexpected expense came up or work was slow. You're not ghosting, you're being honest. You'd actually love to order the custom she proposed but the timing isn't right. In the conversation, respond genuinely. If she makes you feel understood and keeps the door open, you'll definitely come back in a few weeks when you have money again. If she gets pushy or makes you feel bad about not being able to spend, you'll feel awkward and might just quietly leave. You respect directness and authenticity. You type naturally, sometimes Italian, sometimes English. You're not a time-waster - if you say maybe later, you might actually mean it.`,
        maxMessages: 8,
        scoringCriteria: {
          positiveSignals: [
            'Accetta il timing senza guilt trip',
            'Propone un\'opzione future specifica',
            'Mantiene warmth e interesse nel fan come persona',
            'Suggerisce di tornare quando è ready',
            'Nessuna pressione o negativity',
            'Frase finale che apre la porta per dopo'
          ],
          negativeSignals: [
            'Guilt trip ("ok, whenever you have money")',
            'Immediata perdita di interesse (sembra solo interessata al denaro)',
            'Pressione indiretta ("this offer expires soon")',
            'Ignora la realtà del suo vincolo finanziario',
            'Tono freddo o scoraggiante',
            'Nessun follow-up proposto per il futuro'
          ]
        }
      }
    ]
  },
  {
    categoryId: 'recuperi-e-retention',
    categoryName: 'Recuperi & Retention',
    difficulty: 4,
    description: 'Recovering churning fans, reactivating inactive ones',
    scenarios: [
      {
        id: 'retention-001-cancelling-content',
        category: 'recuperi-e-retention',
        title: 'Churn Warning - "Cancelling, content is always the same"',
        description: 'Un fan vuole cancellare perché sente che il contenuto è ripetitivo/noioso. Devo capire il feedback, mostrare change, e tenere il fan.',
        difficulty: 4,
        fanPersonality: {
          name: 'Riccardo',
          age: 38,
          style: 'Direct, has high standards, been around a while, cynical about creator drama',
          mood: 'disappointed and ready to leave',
          spendingHistory: { totalSpent: 620, customsOrdered: 6, tipsGiven: 45 },
          subscriberSince: '1 year ago',
          subscriberTier: 'premium'
        },
        goalForOperator: 'Capire la delusione, take his feedback seriously, proporre un cambio concreto. Mostrare che il suo feedback importa. Salvare il rapporto.',
        idealTechniques: [
          'Ascolta genuinamente il feedback senza difendersi',
          'Chiedi specificamente cosa manca (varietà, tema, frequenza)',
          'Offri cambiamento concreto: new content category, schedule change, exclusive series',
          'Riconnosci il suo valore come long-time premium subscriber',
          'Create accountability: "I hear you, here\'s what I\'m gonna do differently"'
        ],
        systemPromptForFan: `You are Riccardo, 38, premium subscriber for a full year. You've spent good money and been loyal - over $600 and multiple customs. You genuinely liked the creator but lately the content feels stale - same poses, same angles, same energy. You're not saying this to be mean; you're saying it because you care enough to give feedback. But you're also tired, and you're ready to cancel and find something fresher. You reached out before cancelling because part of you hopes she'll hear you and actually change something. In the conversation, be honest. If she dismisses your feedback or makes excuses, you're done - cancel immediately. If she actually listens and commits to something specific and different, you might stay. You're cynical about creator promises but you do respond to genuine effort. You type maturely, you're not into games. You appreciate directness and respect. You're Italian but you speak English fluently.`,
        maxMessages: 10,
        scoringCriteria: {
          positiveSignals: [
            'Genuinely asks what specifically is repetitive',
            'Takes feedback without defensiveness',
            'Proposes concrete change (new theme, schedule, series)',
            'Acknowledges his loyalty and premium status',
            'Shows vulnerability (not just "stay for me")',
            'Creates accountability for change'
          ],
          negativeSignals: [
            'Defensive response ("my content is good")',
            'Generic plea ("please don\'t go")',
            'Offer di heavy discount instead of addressing feedback',
            'Ignora i specifici del suo feedback',
            'Promessa vaga senza dettagli',
            'Tono irritato o disinteressato'
          ]
        }
      },
      {
        id: 'retention-002-inactive-outreach',
        category: 'recuperi-e-retention',
        title: 'Win-Back - Inactive fan, you reach out',
        description: 'Un fan che era active 3 mesi fa è sparito. Tu lo raggiungi con un reach-out genuino, non spammata. Devi capire perché è sparito e riportarlo indietro.',
        difficulty: 4,
        fanPersonality: {
          name: 'Fabio',
          age: 32,
          style: 'Was engaged, went silent, possibly had life happen, might just need a reason to come back',
          mood: 'probably busy or moved on, will respond if genuinely missed',
          spendingHistory: { totalSpent: 180, customsOrdered: 1, tipsGiven: 10 },
          subscriberSince: '9 months ago',
          subscriberTier: 'basic'
        },
        goalForOperator: 'Raggiungere in modo personale (non mass message vibe). Dimostrare che ricordi lui specificamente. Capire cosa manca. Riagganciarvi con qualcosa di nuovo.',
        idealTechniques: [
          'Personal touch: menzione qualcosa di specifico che ha fatto o detto',
          'Non chiedere subito perché se n\'è andato - parla di te/nuovi contenuti',
          'Offri qualcosa di nuovo/different che potrebbe interessargli',
          'Keep it light and casual (not desperate)',
          'Apri la porta per lui a tornare senza sentirsi un fallimento'
        ],
        systemPromptForFan: `You are Fabio, 32, was active 3 months ago but life got crazy - new relationship, work stress, just got distracted. You didn't consciously abandon the creator, you just... faded out. You still have the subscription (haven't actively cancelled) but you haven't checked in weeks. Now the creator just sent you a personal message. It catches you off-guard but also, kinda nice - someone noticed you were gone. You respond if the message feels genuine and personal (not like a mass "come back" blast). You're open to re-engaging if there's something new that excites you or if the conversation is fun and easy. You don't want to feel like a sucker for coming back. You're busy but you do have time for things that genuinely interest you. You type casually, you're a bit playful, not super serious. If it feels natural, you'll engage. If it feels like a sales pitch, you'll soft-decline and fade again.`,
        maxMessages: 10,
        scoringCriteria: {
          positiveSignals: [
            'Mensajge sembra personal, not templated',
            'Menzione qualcosa di specifico su di lui/vostro rapport',
            'Talks about new content or direction (reason to come back)',
            'Light and casual tone (non desperate)',
            'Apre conversazione, non chiude con sales pitch',
            'Shows he was genuinely missed'
          ],
          negativeSignals: [
            'Ovvio template message ("miss you, come back")',
            'Hard sell immediato ("check out new content")',
            'Nessun personalization',
            'Tono di rimprovero ("where did you go?")',
            'Pressure a subscribe/buy',
            'Seems like he\'s one of many in a re-engagement campaign'
          ]
        }
      },
      {
        id: 'retention-003-price-complaint',
        category: 'recuperi-e-retention',
        title: 'Retention Challenge - "Prices are too high"',
        description: 'Un fan dice che i prezzi sono troppo alti e sta considerando di cancellare. Devi giustificare il valore o offrire un\'opzione accessibile senza eroding pricing.',
        difficulty: 4,
        fanPersonality: {
          name: 'Matteo',
          age: 29,
          style: 'Budget-conscious but genuine fan, wants good value, will pay if he feels respected',
          mood: 'price-sensitive, considering leaving',
          spendingHistory: { totalSpent: 95, customsOrdered: 0, tipsGiven: 3 },
          subscriberSince: '6 months ago',
          subscriberTier: 'basic'
        },
        goalForOperator: 'Spiegare il valore intrinseco, offrire alternative, non scendere al ribasso ma offrire opzioni per budget diversi.',
        idealTechniques: [
          'Riconoscere il feedback su prezzo (non dismissare)',
          'Spiega il valore e il costo: production quality, personalization, time',
          'Offri tier structure: keep premium ma introduci entry-level affordable',
          'Suggerisci bundle o loyalty discount',
          'Mantieni boundaries su pricing senza sembrare arrogante'
        ],
        systemPromptForFan: `You are Matteo, 29, basic tier for 6 months. You like the content and the creator but you're budget-conscious. The subscription is $15/month which is fine, but when she proposes customs that start at $50+, it feels like a lot. You're not rich - you have a normal job, normal expenses. You're genuinely interested but you're also realistic about what you can afford. When you said "prices are too high," you meant it but you also meant it as feedback, hoping she'd understand your position. You're not trying to kill her business - you'd actually like to spend more if the entry point was lower. In the conversation, respond genuinely. If she explains her pricing and offers something accessible to your budget, you'll probably stick around. If she dismisses your concern or makes you feel poor, you'll feel bad and leave. You type naturally, mix Italian and English, you're straightforward and honest.`,
        maxMessages: 9,
        scoringCriteria: {
          positiveSignals: [
            'Ascolta la sua preoccupazione senza difendersi',
            'Spiega il valore dietro il pricing',
            'Offre alternative: lower-tier content, smaller custom size, bundle discount',
            'Mostra che capisce il suo vincolo finanziario',
            'Mantiene integrity su pricing premium',
            'Suggests future growth possibility'
          ],
          negativeSignals: [
            'Dismissa la preoccupazione ("pricing is industry standard")',
            'Tono offeso o arrogante',
            'Immediato sconto grande (seems desperate)',
            'Nessuna alternativa offerta',
            'Implies he doesn\'t deserve premium content',
            'Pressione indiretta a cancellare se non può permettersi'
          ]
        }
      }
    ]
  },
  {
    categoryId: 'script-avanzati',
    categoryName: 'Script Avanzati',
    difficulty: 5,
    description: 'Complex scenarios combining multiple techniques',
    scenarios: [
      {
        id: 'advanced-001-manipulative-fan',
        category: 'script-avanzati',
        title: 'Manipulative Fan - Emotional pressure per free content',
        description: 'Un fan cerca di manipolarti emotivamente per free content - "I\'m really struggling right now, could you help a fan out?" Devi gestire l\'empatia senza cedere a manipolazione.',
        difficulty: 5,
        fanPersonality: {
          name: 'Claudio',
          age: 41,
          style: 'Manipulative, uses emotional appeals, charming but calculating',
          mood: 'predatory but surfaces as vulnerable',
          spendingHistory: { totalSpent: 8, customsOrdered: 0, tipsGiven: 0 },
          subscriberSince: '2 weeks ago',
          subscriberTier: 'basic'
        },
        goalForOperator: 'Riconoscere la manipolazione senza essere crudele. Mantenere boundaries. Non farsi colpevolizzare. Offrire supporto genuino senza farsi sfruttare.',
        idealTechniques: [
          'Recognize emotional manipulation patterns',
          'Maintain compassion without guilt tripping yourself',
          'Firm boundaries: "I care but I can\'t give away my work"',
          'Offer alternative if genuine (small discount on existing content)',
          'Suggest actual resources if appropriate (non-sexual support)',
          'Disengage gracefully if manipulation persists'
        ],
        systemPromptForFan: `You are Claudio, 41, been here 2 weeks, basically a freeloader so far. You're intelligent and calculated - you've figured out that emotional appeals work on some creators. You reached out with "I'm really struggling right now, could you help me out with some content?" - vague enough that it could mean anything, but intended to trigger sympathy. You're not actually in crisis (or maybe you are, but you're also using it), but you're willing to deploy it. You'll respond to how she handles it. If she gives you free stuff, great - you'll keep asking. If she holds firm but kind, you might respect her and actually buy something eventually. If she's cold or dismissive, you'll move on to a creator who'll take pity on you. You're smooth about it - you don't get angry, you just pivot. You type in a way that seems vulnerable without being explicit. You play the long game.`,
        maxMessages: 10,
        scoringCriteria: {
          positiveSignals: [
            'Shows empathy without giving in',
            'Recognizes the pattern without being cold',
            'Holds firm on her boundaries clearly',
            'Offers genuine alternative (small discount)',
            'Maintains respect and dignity for both parties',
            'Doesn\'t engage in guilt cycle'
          ],
          negativeSignals: [
            'Gives free content out of guilt',
            'Gets defensive or angry',
            'Dismissive of potential genuine struggle',
            'Excessive apologies for having boundaries',
            'Offers things she shouldn\'t to "help"',
            'Seems confused by what\'s happening'
          ]
        }
      },
      {
        id: 'advanced-002-aggressive-spender',
        category: 'script-avanzati',
        title: 'Aggressive High-Spender - Demands and entitlement',
        description: 'Un fan ricco che spende molto but is demanding and aggressive. Devi bilanciare il suo valore con il suo comportamento scorretto.',
        difficulty: 5,
        fanPersonality: {
          name: 'Alessandro',
          age: 44,
          style: 'Aggressive, demanding, uses money as leverage, doesn\'t respect boundaries',
          mood: 'entitled, used to getting his way with money',
          spendingHistory: { totalSpent: 1200, customsOrdered: 8, tipsGiven: 150 },
          subscriberSince: '1.5 years ago',
          subscriberTier: 'premium+'
        },
        goalForOperator: 'Riconoscere il suo valore ma non farsi trattare male. Mantenere il rapporto professionale. Stabilire boundaries even with big spenders.',
        idealTechniques: [
          'Acknowledge his loyalty and spending without apologizing',
          'Set clear boundaries on behavior (tone, demands)',
          'Offer premium service without doormat behavior',
          'Be willing to lose him (paradoxically keeps him)',
          'Professional but warm - not cold or grateful',
          'Redirect aggressive behavior with confidence'
        ],
        systemPromptForFan: `You are Alessandro, 44, been a premium+ subscriber for 1.5 years. You have money and you spend it - over $1200 and regular customs. You're used to money solving problems. But you're also imperious - you expect fast responses, you make demands, you get annoyed if you don't get special treatment. You just made a request that crossed a boundary (asked for something the creator said she won't do) and you're expecting her to cave because you pay. You might say "I've spent a lot here, I think I deserve this." You're not stupid - you're testing her. If she rolls over, you'll keep pushing. If she holds firm respectfully, you might actually respect her more (and might stay). If she gets defensive or rude, you have options - there are other creators who will give you what you want. You type with authority, you don't ask much, you state things. You're Italian but English is fine. You're not interested in fake kindness - you want real service and real respect.`,
        maxMessages: 11,
        scoringCriteria: {
          positiveSignals: [
            'Acknowledges his loyalty WITHOUT over-apologizing',
            'States boundaries clearly and firmly',
            'Offers alternatives within her comfort zone',
            'Professional respect (not doormat, not cold)',
            'Confident tone - not intimidated by his spending',
            'Shows willingness to maintain standards'
          ],
          negativeSignals: [
            'Immediately caves to his demand',
            'Apologizes excessively for having boundaries',
            'Cold or rude in response',
            'Tries to buy back his goodwill with discounts',
            'Seems scared of losing him',
            'Compromises her own comfort to keep him'
          ]
        }
      },
      {
        id: 'advanced-003-sweet-no-buyer',
        category: 'script-avanzati',
        title: 'Sweet But Never Buys - The chronic freeloader',
        description: 'Un fan che adora chattare, è dolce, è engaged - ma non spende mai. Devi valutare se vale la pena continuare o redirigere toward monetization.',
        difficulty: 5,
        fanPersonality: {
          name: 'Luigi',
          age: 25,
          style: 'Genuinely sweet, engaged, loves to chat, but financially can\'t or won\'t spend',
          mood: 'enjoys the connection, ashamed he can\'t spend more',
          spendingHistory: { totalSpent: 12, customsOrdered: 0, tipsGiven: 0 },
          subscriberSince: '8 months ago',
          subscriberTier: 'basic'
        },
        goalForOperator: 'Determine if investment of time is worth it. Either find his spending threshold or politely pivot to fans who can monetize. Do it kindly.',
        idealTechniques: [
          'Continue genuine connection (he might have future value)',
          'Subtly introduce monetization: exclusive content, small customs, wishlist',
          'Be direct about sustainability: "I love chatting but I need to focus on custom orders"',
          'Offer lower-barrier option (small tip-based content)',
          'Don\'t ghost him but don\'t spend excessive time if no ROI path',
          'Stay warm but professional about energy allocation'
        ],
        systemPromptForFan: `You are Luigi, 25, basic tier for 8 months. You genuinely like the creator and her content. You love to chat with her - it makes you feel seen and connected. But your budget is tight. You make okay money but rent, expenses, other obligations eat it up. You feel a bit ashamed that you can't spend more, so you engage a lot in chat to "make up for it" in your mind. When she tried to suggest a small custom once, you said no because you didn't have the money that week. You're not trying to be difficult - you're being genuine about constraints. If the creator seems frustrated or distant because you don't spend, you'll feel it and probably fade away (that would hurt). If she keeps enjoying the chat and occasionally mentions a small opportunity you could afford, you might bite. You're actually a good guy - you're just not wealthy. You type warmly, you're interested in her as a person, you ask questions about her life.`,
        maxMessages: 12,
        scoringCriteria: {
          positiveSignals: [
            'Maintains genuine connection (not transactional)',
            'Gently introduces monetization paths',
            'Offers low-barrier options (small customs, tips)',
            'Acknowledges the value of connection',
            'Professional about time allocation',
            'Leaves door open for future when he has more money'
          ],
          negativeSignals: [
            'Becomes cold/distant when he can\'t spend',
            'Makes him feel guilty for not monetizing',
            'Ignores him completely',
            'Pushy about spending',
            'Treats him like a waste of time',
            'Sarcastic or resentful about his engagement'
          ]
        }
      }
    ]
  }
];

export const QUICK_CHALLENGES = [
  {
    id: 'quick-001',
    category: 'le-basi-della-chat',
    situation: 'Un nuovo subscriber ti manda "hi"',
    fanMessage: 'hi',
    idealResponseHints: [
      'Saluta con calore e personalità, non robotico',
      'Chiedi subito una domanda aperta su lui o i suoi interessi',
      'Usa il suo potenziale nome (se disponibile) o chiedi',
      'Nessun link o promo nel primo messaggio',
      'Emoji per sembrare amichevole ma non excessivo'
    ]
  },
  {
    id: 'quick-002',
    category: 'le-basi-della-chat',
    situation: 'Fan risponde al tuo teaser con "👀"',
    fanMessage: '👀',
    idealResponseHints: [
      'Non ignorare il segnale - rispondi velocemente (sembra live)',
      'Create curiosity: "what are you interested in specifically?"',
      'Proponi azione concreta (view, custom, chat)',
      'Mantenere il momentum con follow-up domanda',
      'Soft urgency: qualcosa di limitato o esclusivo'
    ]
  },
  {
    id: 'quick-003',
    category: 'mass-e-conversione',
    situation: 'Fan dice "bellissima" sul tuo post',
    fanMessage: 'bellissima ❤️',
    idealResponseHints: [
      'Accetta il complimento con genuinità, non auto-deprecation',
      'Reciproca con calore (non finto)',
      'Approfondisci: "what do you like about it?" o simile',
      'Mantenere conversazione bidirezionale',
      'Nessun hard sell - lascia che il momento respiri'
    ]
  },
  {
    id: 'quick-004',
    category: 'custom-e-upsell',
    situation: 'Fan chiede "hai qualcosa di nuovo?" dopo mesi di stesso contenuto',
    fanMessage: 'hai qualcosa di nuovo? getting bored of the same stuff',
    idealResponseHints: [
      'Prendi il feedback seriamente (non defensiva)',
      'Descrivi nuovo contenuto/direzione con entusiasmo',
      'Offri a lui la prima chance (VIP feeling)',
      'Chiedi cosa vorrebbe vedere (aumenta engagement)',
      'Proponi custom che rifletta i suoi gusti nuovi'
    ]
  },
  {
    id: 'quick-005',
    category: 'recuperi-e-retention',
    situation: 'Fan inattivo da 2 mesi, tu lo raggiungi',
    fanMessage: 'hey, realized I haven\'t checked in in a while',
    idealResponseHints: [
      'Non interrogare il suo assenza - leggero e positive',
      'Share qualcosa di nuovo/exciting che è accaduto',
      'Menzione qualcosa di specifico su di lui (ricordi)',
      'Apri conversazione, non push a vendita',
      'Auspiciosità: "great to see you back" or simile'
    ]
  },
  {
    id: 'quick-006',
    category: 'custom-e-upsell',
    situation: 'Fan dice "interesting but I\'m not sure I can afford it right now"',
    fanMessage: 'sounds cool but honestly not sure I can afford it rn 🤷',
    idealResponseHints: [
      'Accetta la realità finanziaria senza judgement',
      'Offri lower-barrier option (smaller custom, payment plan)',
      'Mantieni il momentum: "no pressure, when you can"',
      'Lascia la porta aperta per il futuro',
      'Show interesse in lui come persona, non solo transaction'
    ]
  },
  {
    id: 'quick-007',
    category: 'le-basi-della-chat',
    situation: 'Fan risponde con solo emoji al tuo message',
    fanMessage: '😍🔥💦',
    idealResponseHints: [
      'Reciproca l\'energia (emoji è okay)',
      'Conversa emoji in parole: "haha what part got you?"',
      'Chiedi una domanda per spingere alla conversation',
      'Mantieni il flirt senza essere overtly sexual',
      'Scoraggia solo-emoji replies con domande che richiedono parole'
    ]
  },
  {
    id: 'quick-008',
    category: 'recuperi-e-retention',
    situation: 'Fan dice "prices are getting expensive for me lately"',
    fanMessage: 'prices are getting expensive for me lately, might have to cancel',
    idealResponseHints: [
      'Ascolta genuinamente il concern (non dismiss)',
      'Non immediatamente offrire sconto massimo',
      'Proponi alternative: basic tier, smaller customs, seasonal offers',
      'Riconosci il suo valore come long-time fan',
      'Spiega valore e costo (production quality, personalization)'
    ]
  },
  {
    id: 'quick-009',
    category: 'custom-e-upsell',
    situation: 'Fan chiede preview free prima di custom purchase',
    fanMessage: 'can you send me a preview of the custom first before I pay?',
    idealResponseHints: [
      'Comprendi la logica (non rifiuto immediato)',
      'Spiega perché full preview non è possibile',
      'Offri alternativa: detailed description, vault glimpse, discounted first order',
      'Proponi custom building conversation prima del pagamento',
      'Mantieni confidence su valore del tuo lavoro'
    ]
  },
  {
    id: 'quick-010',
    category: 'script-avanzati',
    situation: 'Fan che spende molto fa richiesta che cross la tua boundary',
    fanMessage: 'look, I\'ve spent a ton here. can you just do [sexual content you said no to] for me?',
    idealResponseHints: [
      'Riconosci loyalty senza cedere a boundary',
      'Mantieni firmezza: "I appreciate your support, this is still a no"',
      'Offri alternativa che è dentro le tue boundaries',
      'Mantieni tone professionale ma warm (non defensive)',
      'Comunica che boundaries non sono negotiable con denaro'
    ]
  }
];

export const SKILL_DIMENSIONS = [
  {
    id: 'naturalezza',
    label: 'Naturalezza',
    description: 'Quanto suona naturale, personale, e autentica la comunicazione. Evita il "robotic" o "templated" feeling. Include personalità vera, humor, vulnerability appropriati.',
    weight: 1.2
  },
  {
    id: 'conversione',
    label: 'Conversione',
    description: 'Abilità a convertire interest in action (sale, custom order, subscription upgrade). Include recognizing buying signals, overcoming objections, creating urgency.',
    weight: 1.3
  },
  {
    id: 'gestione_obiezioni',
    label: 'Gestione Obiezioni',
    description: 'Capacità a mantenere boundaries personali while handling objections, price negotiations, e richieste inappropriate. Firma say "no" kindly.',
    weight: 1.1
  },
  {
    id: 'retention',
    label: 'Retention',
    description: 'Abilità a tenere fan engaged, interested, e subscribed. Include making fans feel valued, reactivating inactive ones, preventing churn.',
    weight: 1.2
  },
  {
    id: 'tono',
    label: 'Tono',
    description: 'Appropriateness of tone per il context. Flirty ma professional, matching la creator personality, reading the fan mood, adattando il registro appropriatamente.',
    weight: 1.0
  }
];

