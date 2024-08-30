// stores/fonts.js
import { defineStore } from 'pinia'

import { useCollection, useFirestore } from 'vuefire'
import { collection, orderBy, query, doc, updateDoc, deleteDoc, setDoc, addDoc } from 'firebase/firestore'

export const useDayStore = defineStore('day', {
    state: () => {
        return {
            dayToEdit: {},
            dayToDelete: {}
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
        },
        async deleteDay(dte) {
            this.dayToDelete = dte;
            
            const db = useFirestore()
            const docRef = doc(db, "days", `${dte.id}`);

            await deleteDoc(docRef, {
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