# Feature layer

Each ERP capability owns its pages, components, hooks, model, API adapter, and
feature-specific styles. A feature may depend on `shared` and `infrastructure`,
but features must not reach into another feature's private files.
