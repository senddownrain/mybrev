// stores/fonts.js
import { defineStore } from 'pinia'

export const useFontsStore = defineStore('fonts', {
  state: () => {
    return { 
        header: 10,
        text: 0,
        headerColor: 'red'
     }
  },
  // could also be defined as
  // state: () => ({ count: 0 })
  actions: {
    decreaseFont(){
      this.header--
    },
    increaseFont(){
      this.header++
    }
  },

  getters: {
    getHeader: (state) => {
      return {
        fontSize: `${state.header}px`,
        color: state.headerColor
      }
    },
  },
})