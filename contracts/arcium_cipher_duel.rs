use arcis::*;

#[encrypted]
mod cipher_duel {
    use arcis::*;

    #[derive(Clone, Copy)]
    pub struct Loadout {
        pub strike: u8,
        pub guard: u8,
        pub focus: u8,
    }

    pub struct DuelOutcome {
        pub winner: u8,
        pub player_one_score: i16,
        pub player_two_score: i16,
        pub margin: u16,
    }

    fn score(own: Loadout, opponent: Loadout) -> i16 {
        own.strike as i16 * 3 + own.focus as i16 * 2 + own.guard as i16 - opponent.guard as i16 * 2
    }

    #[instruction]
    pub fn resolve_duel(
        player_one_ctxt: Enc<Shared, Loadout>,
        player_two_ctxt: Enc<Shared, Loadout>,
    ) -> DuelOutcome {
        let player_one = player_one_ctxt.to_arcis();
        let player_two = player_two_ctxt.to_arcis();

        let player_one_score = score(player_one, player_two);
        let player_two_score = score(player_two, player_one);

        let winner = if player_one_score > player_two_score {
            1
        } else if player_two_score > player_one_score {
            2
        } else {
            0
        };

        let margin = if player_one_score > player_two_score {
            (player_one_score - player_two_score) as u16
        } else {
            (player_two_score - player_one_score) as u16
        };

        DuelOutcome {
            winner,
            player_one_score,
            player_two_score,
            margin,
        }
    }
}
