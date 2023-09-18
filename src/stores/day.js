// stores/fonts.js
import { defineStore } from 'pinia'

import { useCollection, useFirestore } from 'vuefire'
import { collection, orderBy, query, doc, updateDoc, setDoc, addDoc } from 'firebase/firestore'

export const useDayStore = defineStore('day', {
    state: () => {
        return {
            dayToEdit: {}
        }
    },
    actions: {
        setDayToEdit(dte) {
            this.dayToEdit = dte;
        },
        async updateDay(dte) {
            this.dayToEdit = dte;
            
            const db = useFirestore()
            const docRef = doc(db, "days", `${dte.id}`);

            await updateDoc(docRef, {
                ...dte
            });
        }
    },

    getters: {
        getDayToEdit: (state) => {
            return state.dayToEdit;
        }
    },
})