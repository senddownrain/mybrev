// stores/fonts.js
import { defineStore } from 'pinia'

export const useFontStore = defineStore('font', {
  state: () => {
    return { 
        headerSize: 1.5,
        headerLetterSpacing: 0.0125,
        textLetterSpacing: 0.02,
        textSize: 0.975,
        textLine: 1.25,
        headerColor: 'red'
     }
  },
  // could also be defined as
  // state: () => ({ count: 0 })
  actions: {
    decreaseFont(){
      console.log(this.textSize)
      this.textLetterSpacing = this.textLetterSpacing - 0.005
      this.textSize = this.textSize - 0.1
      this.headerSize = this.headerSize - 0.05
      this.headerLetterSpacing = this.headerLetterSpacing - 0.005
      this.textLine = this.textLine - 0.03

    },
    increaseFont(){
      console.log(this.textSize)
      this.textLetterSpacing = this.textLetterSpacing + 0.005
      this.textSize = this.textSize + 0.1
      this.headerSize = this.headerSize + 0.05
      this.headerLetterSpacing = this.headerLetterSpacing + 0.05
      this.textLine = this.textLine + 0.03
    }
  },

  getters: {
    getHeader: (state) => {
      return {
        headerSize: `${state.headerSize}rem`,
        headerLetterSpacing: `${state.headerLetterSpacing}rem`,
        textSize: `${state.textSize}rem`,
        textLetterSpacing: `${state.textLetterSpacing}rem`,
      }
    },
  },
})