The latest cloud evidence passed all guest and gate checks for each tested commit. The initial PR #205 guest attempt remains recorded as a failure.

| Target and exact product SHA | Latest guest | Latest gate |
|---|---:|---:|
| #204 baseline `99d86fbdc83b7a1b41385f0348100e613314dde2` | 37/37, first run | 25/25, first run |
| main `aa3443624869ad583527ed2c540585689f2e2f85` | 37/37, follow-up | 25/25, first run |
| #205 `b9d039d5e6d727f24214ebc1db771fb01226f8f4` | 37/37, follow-up | 25/25, first run |

All attempts used the verifier source from `99d86fbdc83b7a1b41385f0348100e613314dde2`. The entire verifier tree matched `a32cc612da3642586c617ffecead359a2ec9c9e8` at each product checkout.

The first PR #205 guest attempt passed 36/37. The initial Tencent 1D K-line returned HTTP 503 and zero bars, which failed the canvas check. Its 1Y response returned 246 bars and passed. The underlying provider error is unknown. [First run](https://github.com/osborn-studio/osbornalpha/actions/runs/42551139520)

The controlled follow-up ran main and PR #205 guests sequentially with unchanged assertions. The 1D Tencent request returned 68 bars on main and 69 on PR #205. Both 1Y responses returned 246 bars. Both runners selected Noto Sans CJK SC for zh-cn from Ubuntu package `fonts-noto-cjk 1:20230817+repack1-3`. Gate evidence comes from the first run. These observations cover the recorded live runs. [Follow-up run](https://github.com/osborn-studio/osbornalpha/actions/runs/42551794137)

PR #205 remained open at the exact tested head, with all three normal CI checks successful and review required. The diagnostic worktree was removed and worktrees pruned. The branch and original/follow-up artifacts remain available.
