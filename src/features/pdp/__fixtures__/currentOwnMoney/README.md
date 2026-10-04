# Native current own-money fixture

`native226.json` is the unchanged `body` from the synthetic native HTTP response
`final226-valid-selected-with-unpriced-sold-out-sibling.private.json`, recorded by
`final226_native_http.cjs` against gateway commit
`226e0f338729f2287a08c372c877cc3bdbe2a95b` (tree
`48bd9ea86e88d6001a22611bbfc14a4e1bc389cd`). The source/test manifest is
`outputs/reap-pdp-current-own-money-focused-native-source-tests.json` in the
operator workspace. Fixture SHA-256:
`68d637f4038b46047d74cfaea1c999ec777869363cb10dc2d98d3ea6c1aea67c`.

The selected 50 mL variant has current own money USD49; the visible 100 mL
sibling has unavailable current own money and is out of stock. Tests use the
real UI adapter. The two-priced-size and product-line/sole-variant controls
explicitly mutate only their in-memory UI models. Checkout responses are
protocol models; they do not prove backend admission or accepted response loss.
