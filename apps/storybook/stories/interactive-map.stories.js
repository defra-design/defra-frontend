// @defra/interactive-map — a COMPANION package, not part of @defra/frontend.
//
// This file lives in apps/storybook, not in the package, and that placement is
// the point. The map is a devDependency of this app only; nothing a service
// installs from @defra/frontend pulls it in. `npm run boundary` fails the build
// if it ever appears in the package's dependencies.
//
// Why it cannot simply be adopted: it depends on govuk-frontend ^5 directly
// rather than as a peer, while this repo is built on 6. npm contains that (the
// v5 copy nests under the map package and ours stays 6.4.0), but a service
// bundling both would ship two copies of GOV.UK Frontend. See CONTRIBUTING.md.
import InteractiveMap from '@defra/interactive-map'
import maplibreProvider from '@defra/interactive-map/providers/maplibre'
import '@defra/interactive-map/css'

// OpenFreeMap needs no API key, so this story works for anyone who opens it.
// A real service would point at Ordnance Survey and hold its own key.
const STYLE = {
  url: 'https://tiles.openfreemap.org/styles/liberty',
  attribution: 'OpenFreeMap © OpenMapTiles, data from OpenStreetMap',
  backgroundColor: '#f5f5f0'
}

let instance = 0

export default {
  title: 'Companion packages/Interactive map',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Accessibility-first map from https://github.com/DEFRA/interactive-map (MIT). ' +
          'A companion package demonstrated here, NOT a dependency of @defra/frontend — ' +
          'it depends on govuk-frontend 5 directly rather than as a peer, so adopting it ' +
          'into the package would put two majors of GOV.UK Frontend in one tree. ' +
          'Services that need a map install it themselves. `npm run boundary` enforces this. ' +
          'Note it is published as alpha, and that a map page cannot fit the standard ' +
          'JS byte budget — it needs its own.'
      }
    }
  },
  render: (args) => {
    // A fresh id per render: Storybook replaces the DOM on every arg change,
    // and the map holds a reference to the container it was given.
    const id = `defra-map-${++instance}`
    const el = document.createElement('div')
    el.id = id

    // The map must initialise after the element is in the document, so it can
    // measure. requestAnimationFrame is enough; the decorator order guarantees
    // the story is attached by then.
    window.requestAnimationFrame(() => {
      try {
        new InteractiveMap(id, {
          mapProvider: maplibreProvider(),
          behaviour: args.behaviour,
          mapLabel: args.mapLabel,
          zoom: args.zoom,
          center: args.center,
          containerHeight: args.containerHeight,
          mapStyle: STYLE
        })
      } catch (error) {
        el.textContent = `Map failed to initialise: ${error.message}`
        console.error('interactive-map:', error)
      }
    })

    return el
  },
  argTypes: {
    behaviour: {
      description:
        '`buttonFirst` (upstream default) hides the map behind a button that opens it ' +
        'fullscreen. `inline` renders it in the page. `hybrid` is a button below ' +
        '`hybridWidth` and inline above it. `mapOnly` is always fullscreen.',
      control: 'select',
      options: ['inline', 'buttonFirst', 'hybrid', 'mapOnly']
    },
    containerHeight: { description: 'Height of the inline map. Ignored when fullscreen.' },
    mapLabel: { description: 'Accessible name for the map region.' }
  },
  args: {
    // `inline` rather than the upstream `buttonFirst` default: the Storybook
    // preview is narrower than the mobile breakpoint, so `hybrid` and
    // `buttonFirst` both correctly render only a button here and the map
    // itself is never visible. Services should pick the behaviour that suits
    // the page, not copy this.
    behaviour: 'inline',
    mapLabel: 'Ambleside',
    zoom: 14,
    center: [-2.968, 54.425],
    containerHeight: '650px'
  }
}

export const Default = {
  name: 'default',
  parameters: {
    docs: {
      description: {
        story:
          'Rendered from the published alpha with OpenFreeMap tiles, so it needs no key.'
      }
    }
  }
}
