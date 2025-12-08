/**
 * APP.JS - Gerencia Time Tracker, Cronômetro e Histórico
 * Arquivo específico para time_tracker.html
 */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. BANCO DE DADOS E HELPERS
    // ==========================================
    class MockDatabase {
        constructor() { this.prefix = 'dhl_time_tracker_'; }
        
        _getKey(col) { return `${this.prefix}${col}`; }
        _getData(col) { return JSON.parse(localStorage.getItem(this._getKey(col))) || []; }
        _saveData(col, data) { localStorage.setItem(this._getKey(col), JSON.stringify(data)); }

        getEntries(email) { 
            const data = this._getData(`entries_${email}`);
            return Array.isArray(data) ? data.sort((a,b) => b.timestamp - a.timestamp) : []; 
        }
        
        addEntry(email, activity, seconds, timestamp) {
            const entries = this._getData(`entries_${email}`);
            entries.push({ id: Date.now(), activity, seconds, timestamp, exported: false });
            this._saveData(`entries_${email}`, entries);
        }
        
        deleteEntry(email, id) {
            let entries = this._getData(`entries_${email}`);
            entries = entries.filter(e => e.id !== id && e.timestamp !== id);
            this._saveData(`entries_${email}`, entries);
        }

        updateEntry(email, id, newData) {
            let entries = this._getData(`entries_${email}`);
            const idx = entries.findIndex(e => e.id === id);
            if(idx !== -1) {
                entries[idx] = { ...entries[idx], ...newData };
                this._saveData(`entries_${email}`, entries);
                return true;
            }
            return false;
        }
        
        markAsExported(email, filteredEntries) {
            let allEntries = this._getData(`entries_${email}`);
            const idsToMark = filteredEntries.map(e => e.id);
            allEntries.forEach(e => { 
                if(idsToMark.includes(e.id) && !e.exported) e.exported = true; 
            });
            this._saveData(`entries_${email}`, allEntries);
        }

        updateUserAndReturn(email, newData) {
            let users = this._getData('users');
            const idx = users.findIndex(u => u.email === email);
            if(idx !== -1) {
                users[idx] = {...users[idx], ...newData};
                this._saveData('users', users); 
                localStorage.setItem('dhl_active_user', JSON.stringify(users[idx]));
                return users[idx]; 
            }
            return null;
        }
    }

    const db = new MockDatabase();
    
    // Recuperar Sessão
    let currentUser = null;
    try {
        currentUser = JSON.parse(localStorage.getItem('dhl_active_user'));
    } catch(e) { console.error("Erro ao ler usuario", e); }

    // Se não estiver logado, chuta para o index
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    // Variáveis Globais de Estado
    let timerInterval = null;
    let isHistoryExpanded = false;
    let pendingDeleteId = null;
    let currentViewMode = 'detailed'; 
    const activitiesList = ['Reunião', 'Desenvolvimento', 'Email/Admin', 'Intervalo', 'Planejamento', 'Suporte'];
    const CUSTOM_OPTION_VALUE = 'custom_opt_val';

    // Helpers UI
    const formatTime = (totalSec) => {
        const h = Math.floor(totalSec / 3600).toString().padStart(2,'0');
        const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2,'0');
        const s = (totalSec % 60).toString().padStart(2,'0');
        return `${h}:${m}:${s}`;
    };

    const timeToSeconds = (timeStr) => {
        if(!timeStr) return 0;
        const p = timeStr.split(':').map(Number);
        return (p.length === 3) ? p[0]*3600 + p[1]*60 + p[2] : (p.length===2 ? p[0]*3600+p[1]*60 : 0);
    };

    const parseLocalDate = (dateString) => {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    };

    const showNotification = (msg, type='info') => {
        const existing = document.querySelector('.notification'); if(existing) existing.remove();
        const notif = document.createElement('div');
        notif.className = `notification notification-${type}`;
        const icon = type==='success'?'<i class="fas fa-check-circle"></i>':(type==='error'?'<i class="fas fa-exclamation-triangle"></i>':'<i class="fas fa-info-circle"></i>');
        notif.innerHTML = `${icon} <span>${msg}</span>`;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 3500);
    };

    const toggleModal = (modal, show=true) => {
        if(!modal) return;
        if(show) { 
            modal.classList.remove('hidden'); 
            const dd = document.getElementById('user-dropdown'); if(dd) dd.classList.add('hidden');
        } else { 
            modal.classList.add('hidden'); 
        }
    };

    const getFinalActivity = (sel, inp) => (sel.value === CUSTOM_OPTION_VALUE) ? inp.value.trim() : sel.value;

    // ==========================================
    // 2. CONFIGURAÇÃO DE UI
    // ==========================================
    
    const setupSelects = () => {
        const sets = [
            { sel: document.getElementById('activity-select'), inp: document.getElementById('custom-activity-main') },
            { sel: document.getElementById('manual-activity-select'), inp: document.getElementById('manual-custom-activity') },
            { sel: document.getElementById('edit-activity-select'), inp: null } // Edit pode precisar de lógica especial
        ];

        sets.forEach(({ sel, inp }) => {
            if(!sel) return;
            // Limpa e repopula
            sel.innerHTML = '<option value="" disabled selected>Selecione a atividade...</option>';
            activitiesList.forEach(act => sel.appendChild(new Option(act, act)));
            
            const opt = new Option('Outra / Personalizada', CUSTOM_OPTION_VALUE);
            opt.style.color = '#fffff'; opt.style.fontWeight = 'bold';
            sel.appendChild(opt);

            sel.onchange = () => {
                // Se tiver input associado (casos manuais e main)
                if (inp) {
                    if(sel.value === CUSTOM_OPTION_VALUE) { 
                        inp.classList.remove('hidden'); 
                        inp.value = ''; 
                        inp.focus(); 
                    } else { 
                        inp.classList.add('hidden'); 
                        inp.value = ''; 
                    }
                } else {
                     // Lógica específica para o modal de edição (cria input dinamicamente se não existir)
                     // Para simplificar, assumimos que edição usa apenas a lista ou texto fixo.
                }
            };
        });
    };

    const updateUI = () => {
        // Header info
        document.getElementById('header-username').textContent = currentUser.name;
        
        // Avatar
        const avatarImg = document.getElementById('header-avatar');
        if(currentUser.avatar && currentUser.avatar.length > 50) {
            avatarImg.src = currentUser.avatar;
            avatarImg.classList.remove('avatar-placeholder');
        } else {
            avatarImg.src = 'https://raw.githubusercontent.com/wuelnerdotexe/DHL-clone/main/src/assets/default-user.png';
        }

        // Dropdown info
        const ddName = document.getElementById('dropdown-name');
        if(ddName) ddName.textContent = currentUser.name;
        const ddEmail = document.getElementById('dropdown-email');
        if(ddEmail) ddEmail.textContent = currentUser.email;

        // Footer
        const ftYear = document.getElementById('footer-year');
        if(ftYear) ftYear.textContent = new Date().getFullYear();
    };

    // ==========================================
    // 3. LÓGICA DO CRONÔMETRO
    // ==========================================
    const timerDisplay = document.getElementById('timer-display');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const activitySelect = document.getElementById('activity-select');
    const customActivity = document.getElementById('custom-activity-main');

    const updateTimerDisplay = () => {
        const start = localStorage.getItem('dhl_timer_start');
        if (start && timerDisplay) {
            const elapsed = Math.floor((Date.now() - parseInt(start)) / 1000);
            timerDisplay.textContent = formatTime(elapsed);
        }
    };

    const checkActiveTimer = () => {
        const start = localStorage.getItem('dhl_timer_start');
        const activity = localStorage.getItem('dhl_timer_activity');

        if (start) {
            // Estado: Rodando
            startBtn.disabled = true;
            stopBtn.disabled = false;
            activitySelect.disabled = true;
            customActivity.disabled = true;

            // Restaura visual
            if(activity && activitySelect) {
                let found = false;
                Array.from(activitySelect.options).forEach(opt => {
                    if(opt.value === activity) {
                        activitySelect.value = activity;
                        found = true;
                    }
                });
                if(!found) {
                    activitySelect.value = CUSTOM_OPTION_VALUE;
                    customActivity.classList.remove('hidden');
                    customActivity.value = activity;
                }
            }

            if(timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateTimerDisplay, 1000);
            updateTimerDisplay(); 
        } else {
            // Estado: Parado
            timerDisplay.textContent = '00:00:00';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            activitySelect.disabled = false;
            customActivity.disabled = false;
            if(timerInterval) clearInterval(timerInterval);
        }
    };

    startBtn.onclick = () => {
        const act = getFinalActivity(activitySelect, customActivity);
        if(!act) return showNotification('Selecione ou digite a atividade.', 'warning');
        
        localStorage.setItem('dhl_timer_start', Date.now());
        localStorage.setItem('dhl_timer_activity', act);
        checkActiveTimer();
    };

    stopBtn.onclick = () => {
        const start = localStorage.getItem('dhl_timer_start');
        const act = localStorage.getItem('dhl_timer_activity');
        
        if (start && act) {
            const seconds = Math.floor((Date.now() - parseInt(start)) / 1000);
            db.addEntry(currentUser.email, act, seconds, Date.now()); // Salva com o timestamp atual de término
            
            localStorage.removeItem('dhl_timer_start');
            localStorage.removeItem('dhl_timer_activity');
            
            // Reset UI
            activitySelect.value = "";
            customActivity.classList.add('hidden');
            customActivity.value = "";
            checkActiveTimer();
            renderHistory();
            showNotification('Atividade salva com sucesso.', 'success');
        }
    };

    // ==========================================
    // 4. HISTÓRICO E TABELA
    // ==========================================
    const getActiveFilter = () => document.querySelector('#history-filters .filter-btn.active')?.dataset.filter || 'today';

    const getFilteredData = () => {
        let entries = db.getEntries(currentUser.email);
        const filter = getActiveFilter();
        const today = new Date(); today.setHours(0,0,0,0);

        if (filter === 'today') {
            entries = entries.filter(e => new Date(e.timestamp) >= today);
        } else if (filter === 'yesterday') {
            const y = new Date(today); y.setDate(y.getDate()-1);
            entries = entries.filter(e => { const d=new Date(e.timestamp); return d>=y && d<today; });
        } else if (filter === 'week') {
            const w = new Date(today); w.setDate(w.getDate() - today.getDay());
            entries = entries.filter(e => new Date(e.timestamp) >= w);
        } else if (filter === 'month') {
            const m = new Date(today.getFullYear(), today.getMonth(), 1);
            entries = entries.filter(e => new Date(e.timestamp) >= m);
        }
        return entries;
    };

    const getGroupedEntries = (entries) => {
        const grouped = {};
        entries.forEach(e => {
            const dateStr = new Date(e.timestamp).toLocaleDateString();
            const key = `${dateStr}:::${e.activity}`;
            if(!grouped[key]) grouped[key] = { date: dateStr, activity: e.activity, seconds: 0, ids: [e.id], rawTime: e.timestamp };
            grouped[key].seconds += e.seconds;
            if(!grouped[key].ids.includes(e.id)) grouped[key].ids.push(e.id);
        });
        return Object.values(grouped).sort((a,b) => b.rawTime - a.rawTime);
    };

    const renderHistory = () => {
        const tbody = document.querySelector('#history-table tbody');
        const footerTotal = document.getElementById('history-total-time');
        const section = document.querySelector('.history-section');
        
        // Remove botão "Ver mais" antigo se existir
        const oldBtn = document.querySelector('.view-more-container');
        if(oldBtn) oldBtn.remove();
        
        tbody.innerHTML = '';
        
        let entries = getFilteredData();
        const totalSecs = entries.reduce((acc, c) => acc + c.seconds, 0);
        footerTotal.textContent = formatTime(totalSecs);

        if(entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color:var(--text-muted);">Nenhum registro encontrado.</td></tr>';
            return;
        }

        let displayList = (currentViewMode === 'summary') ? getGroupedEntries(entries) : entries;
        const LIMIT = 5; // Mostrar 5 itens inicialmente
        const totalItems = displayList.length;
        const itemsToShow = isHistoryExpanded ? displayList : displayList.slice(0, LIMIT);

        itemsToShow.forEach(item => {
            const tr = document.createElement('tr');
            let dateHTML, statusHTML, actionsHTML;

            if (currentViewMode === 'summary') {
                dateHTML = `<strong>${item.date}</strong>`;
                statusHTML = `<span style="color:var(--text-muted); font-size:0.8rem">Agrupado</span>`;
                actionsHTML = `<span style="color:var(--border)">-</span>`;
            } else {
                const d = new Date(item.timestamp);
                dateHTML = `<div>${d.toLocaleDateString()}</div><small style="color:var(--text-muted)">${d.toLocaleTimeString().slice(0,5)}</small>`;
                statusHTML = `<span class="badge ${item.exported?'badge-green':'badge-red'}">${item.exported?'Exportado':'Pendente'}</span>`;
                actionsHTML = `
                    <button class="icon-btn edit-btn" data-id="${item.id}" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn del-btn" data-id="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>`;
            }

            tr.innerHTML = `<td>${dateHTML}</td><td>${item.activity}</td><td style="font-family:monospace; font-weight:bold">${formatTime(item.seconds)}</td><td>${statusHTML}</td><td>${actionsHTML}</td>`;
            tbody.appendChild(tr);
        });

        // Botão Ver Mais
        if(totalItems > LIMIT) {
            const btnDiv = document.createElement('div');
            btnDiv.className = 'view-more-container';
            const btn = document.createElement('button');
            btn.className = 'btn-view-more';
            btn.innerHTML = isHistoryExpanded ? 'Ver menos <i class="fas fa-chevron-up"></i>' : `Ver mais (${totalItems - LIMIT}) <i class="fas fa-chevron-down"></i>`;
            btn.onclick = () => { isHistoryExpanded = !isHistoryExpanded; renderHistory(); };
            btnDiv.appendChild(btn);
            section.appendChild(btnDiv);
        }

        // Eventos dos botões da tabela
        if(currentViewMode !== 'summary') {
            document.querySelectorAll('.del-btn').forEach(btn => {
                btn.onclick = (e) => {
                    pendingDeleteId = parseInt(e.currentTarget.dataset.id);
                    toggleModal(document.getElementById('delete-confirm-modal'));
                };
            });
            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.onclick = (e) => {
                    const id = parseInt(e.currentTarget.dataset.id);
                    openEditModal(id);
                };
            });
        }
    };

    // ==========================================
    // 5. MODAIS E AÇÕES (Manual, Edit, Delete, Profile)
    // ==========================================
    
    // Modal Manual
    const btnManual = document.getElementById('btn-open-manual');
    if(btnManual) {
        btnManual.onclick = () => {
            const now = new Date();
            const localIso = new Date(now - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            document.getElementById('manual-date-input').value = localIso;
            toggleModal(document.getElementById('manual-modal'));
        };

        document.getElementById('manual-entry-form').onsubmit = (e) => {
            e.preventDefault();
            const act = getFinalActivity(document.getElementById('manual-activity-select'), document.getElementById('manual-custom-activity'));
            const sec = timeToSeconds(document.getElementById('manual-time-input').value);
            const dateInput = document.getElementById('manual-date-input').value;
            
            const d = parseLocalDate(dateInput); 
            const now = new Date(); 
            // Mantem a hora atual para ordenação
            d.setHours(now.getHours(), now.getMinutes(), now.getSeconds()); 
            
            db.addEntry(currentUser.email, act, sec, d.getTime());
            toggleModal(document.getElementById('manual-modal'), false);
            e.target.reset(); 
            document.getElementById('manual-custom-activity').classList.add('hidden');
            renderHistory();
            showNotification('Registro manual adicionado.', 'success');
        };
    }

    // Modal Edit
    const openEditModal = (id) => {
        const entry = db.getEntries(currentUser.email).find(e => e.id === id);
        if(!entry) return;
        
        // Populate
        const dateObj = new Date(entry.timestamp);
        // Ajuste fuso horário simples para o input date
        const localIso = new Date(dateObj - (dateObj.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        
        document.getElementById('edit-timestamp').value = entry.id; // Guardamos o ID no hidden
        document.getElementById('edit-date').value = localIso;
        document.getElementById('edit-time').value = formatTime(entry.seconds);
        
        const editSel = document.getElementById('edit-activity-select');
        // Tenta selecionar. Se não existir na lista, assume que é custom?
        // Simplificação: vamos apenas setar o value. Se for custom, o usuário teria que selecionar "Outro" e digitar.
        // Como o HTML do Edit não tem o campo de input custom no snippet original, vamos simplificar:
        editSel.value = entry.activity;
        if(editSel.selectedIndex === -1) {
             // Se a atividade não está na lista padrão, adicione temporariamente ou use 'Outro'
             const opt = new Option(entry.activity, entry.activity, true, true);
             editSel.add(opt);
        }

        toggleModal(document.getElementById('edit-modal'));
    };

    document.getElementById('edit-form').onsubmit = (e) => {
        e.preventDefault();
        const id = parseInt(document.getElementById('edit-timestamp').value);
        const newDateVal = document.getElementById('edit-date').value;
        const newTimeVal = document.getElementById('edit-time').value;
        const newAct = document.getElementById('edit-activity-select').value;
        
        const seconds = timeToSeconds(newTimeVal);
        const d = parseLocalDate(newDateVal);
        // Preserva hora original do ID se for o mesmo dia, senão usa meio dia
        d.setHours(12,0,0);

        db.updateEntry(currentUser.email, id, {
            activity: newAct,
            seconds: seconds,
            timestamp: d.getTime()
        });
        
        toggleModal(document.getElementById('edit-modal'), false);
        renderHistory();
        showNotification('Registro atualizado.', 'success');
    };

    // Modal Delete (Confirmação)
    document.getElementById('confirm-delete-btn').onclick = () => {
        if(pendingDeleteId) {
            db.deleteEntry(currentUser.email, pendingDeleteId);
            renderHistory();
            showNotification('Registro excluído.', 'success');
        }
        toggleModal(document.getElementById('delete-confirm-modal'), false);
    };

    // Modal Perfil Unificado
    document.getElementById('open-unified-modal').onclick = (e) => {
        e.preventDefault();
        // Preencher dados
        document.getElementById('edit-name').value = currentUser.name || '';
        document.getElementById('edit-email').value = currentUser.email || '';
        document.getElementById('edit-bio').value = currentUser.bio || '';
        document.getElementById('edit-dept').value = currentUser.dept || '';
        document.getElementById('edit-role').value = currentUser.role || '';
        document.getElementById('edit-phone').value = currentUser.phone || '';
        
        if(currentUser.avatar && currentUser.avatar.length > 50) {
            document.getElementById('profile-image-large').src = currentUser.avatar;
        } else {
            document.getElementById('profile-image-large').src = 'https://raw.githubusercontent.com/wuelnerdotexe/DHL-clone/main/src/assets/default-user.png';
        }
        
        toggleModal(document.getElementById('unified-profile-modal'));
    };

// ==========================================
    // LÓGICA DE ATUALIZAÇÃO DE PERFIL SEGURA
    // ==========================================
    
    // Variável para armazenar as mudanças pendentes enquanto pede a senha
    let pendingProfileUpdates = null;

    // 1. Ao clicar em Salvar no Modal de Perfil
    document.getElementById('unified-profile-form').onsubmit = (e) => {
        e.preventDefault();
        
        // Coleta os dados básicos
        const updates = {
            name: document.getElementById('edit-name').value,
            bio: document.getElementById('edit-bio').value,
            dept: document.getElementById('edit-dept').value,
            role: document.getElementById('edit-role').value,
            phone: document.getElementById('edit-phone').value,
            email: document.getElementById('edit-email').value
        };

        // Verifica se houve pedido de troca de senha (nova senha)
        const newPassInput = document.getElementById('edit-new-password').value;
        if(newPassInput && newPassInput.trim() !== "") {
            updates.passwordHash = 'hash_' + newPassInput;
        }

        // Processamento de Imagem (Assíncrono)
        const fileInput = document.getElementById('profile-image-input');
        if(fileInput.files && fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                updates.avatar = evt.target.result;
                triggerPasswordChallenge(updates); // Chama o popup de senha
            };
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            // Mantém avatar antigo se não trocou
            triggerPasswordChallenge(updates);
        }
    };

    // 2. Abre o Popup de Senha
    const triggerPasswordChallenge = (updates) => {
        pendingProfileUpdates = updates; // Guarda na memória
        
        // Limpa erros anteriores e input
        document.getElementById('challenge-password-input').value = '';
        document.getElementById('challenge-error').classList.add('hidden');
        
        // Abre modal de senha
        document.getElementById('password-challenge-modal').classList.remove('hidden');
        document.getElementById('challenge-password-input').focus();
    };

    // 3. Ao Confirmar a Senha no Popup
    document.getElementById('confirm-save-btn').onclick = () => {
        const pwdInput = document.getElementById('challenge-password-input').value;
        const errorMsg = document.getElementById('challenge-error');

        // Validação simples (vazia)
        if(!pwdInput) {
            errorMsg.textContent = "Digite sua senha.";
            errorMsg.classList.remove('hidden');
            return;
        }

        // Verifica se a senha bate com o hash do usuário logado
        if('hash_' + pwdInput !== currentUser.passwordHash) {
            errorMsg.textContent = "Senha incorreta. Tente novamente.";
            errorMsg.classList.remove('hidden');
            // Animação de erro (opcional)
            document.getElementById('challenge-password-input').classList.add('input-error');
            setTimeout(() => document.getElementById('challenge-password-input').classList.remove('input-error'), 500);
            return;
        }

        // SENHA CORRETA: Executa a atualização
        commitProfileUpdate();
    };

    // 4. Efetiva a Gravação no Banco e Mostra Sucesso
    const commitProfileUpdate = () => {
        if(!pendingProfileUpdates) return;

        // Atualiza no "Banco de Dados" (LocalStorage)
        // Nota: Certifique-se que a função updateUserInDB ou updateUserAndReturn existe no seu escopo
        // No app.js use: db.updateUserAndReturn
        // No project_script.js use: updateUserInDB
        
        // Exemplo genérico que funciona se a função estiver definida acima:
        if (typeof db !== 'undefined' && db.updateUserAndReturn) {
             currentUser = db.updateUserAndReturn(currentUser.email, pendingProfileUpdates);
        } else if (typeof updateUserInDB !== 'undefined') {
             updateUserInDB(currentUser.email, pendingProfileUpdates);
             // Recarrega user atual
             currentUser = JSON.parse(localStorage.getItem('dhl_active_user'));
        }

        // Atualiza a UI do Header
        if(typeof updateUserUI !== 'undefined') updateUserUI(); // project_script.js
        if(typeof updateUI !== 'undefined') updateUI(); // app.js

        // Fecha Modal de Senha
        document.getElementById('password-challenge-modal').classList.add('hidden');
        
        // Fecha Modal de Perfil (O PRINCIPAL)
        document.getElementById('unified-profile-modal').classList.add('hidden');

        // Abre Modal de Sucesso
        document.getElementById('success-modal').classList.remove('hidden');
        
        // Limpa campos sensíveis
        document.getElementById('edit-new-password').value = '';
        pendingProfileUpdates = null;
    };

    // 5. Botão "OK" do Modal de Sucesso
    document.getElementById('close-all-modals-btn').onclick = () => {
        document.getElementById('success-modal').classList.add('hidden');
    };

    // 6. Botões "Cancelar" do Modal de Senha
    document.querySelectorAll('.close-challenge-btn').forEach(btn => {
        btn.onclick = () => {
            document.getElementById('password-challenge-modal').classList.add('hidden');
            pendingProfileUpdates = null; // Cancela operação
        };
    });

    const finalizeUpdate = (updates) => {
        currentUser = db.updateUserAndReturn(currentUser.email, updates);
        updateUI();
        toggleModal(document.getElementById('unified-profile-modal'), false);
        showNotification('Perfil atualizado!', 'success');
        document.getElementById('verify-current-password').value = '';
        document.getElementById('edit-new-password').value = '';
    };

    // ==========================================
    // 6. EVENTOS GERAIS (Export, Filters, Logout)
    // ==========================================
    
    // Filtros de Data
    document.querySelectorAll('#history-filters .filter-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('#history-filters .filter-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            isHistoryExpanded = false;
            renderHistory();
        };
    });

    // Filtros de View (Detalhado/Resumo)
    document.querySelectorAll('#view-mode-buttons .filter-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('#view-mode-buttons .filter-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentViewMode = e.currentTarget.dataset.view;
            isHistoryExpanded = false;
            renderHistory();
        };
    });

    // Export Excel
    const btnExport = document.getElementById('export-btn');
    if(btnExport) {
        btnExport.onclick = () => {
            let entries = getFilteredData();
            if (entries.length === 0) return showNotification('Sem dados para exportar.', 'warning');
            
            let data = (currentViewMode === 'summary') 
                ? getGroupedEntries(entries).map(e => ({ 'Data': e.date, 'Atividade': e.activity, 'Tempo': formatTime(e.seconds) }))
                : entries.map(e => ({ 'Data': new Date(e.timestamp).toLocaleDateString(), 'Hora': new Date(e.timestamp).toLocaleTimeString(), 'Atividade': e.activity, 'Duração': formatTime(e.seconds) }));
            
            if(typeof XLSX !== 'undefined') {
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Relatório DHL");
                XLSX.writeFile(wb, "Relatorio_Horas.xlsx");
                
                db.markAsExported(currentUser.email, entries);
                renderHistory(); 
                showNotification('Download iniciado.', 'success');
            } else {
                showNotification('Biblioteca XLSX não carregada.', 'error');
            }
        };
    }

    // Logout
    document.getElementById('logout-btn').onclick = (e) => {
        e.preventDefault();
        localStorage.removeItem('dhl_active_user');
        window.location.href = 'index.html';
    };

    // Toggle Menu Usuário
    document.getElementById('user-menu-btn').onclick = () => {
        document.getElementById('user-dropdown').classList.toggle('hidden');
    };

    // Dark Mode
    const dmBtn = document.getElementById('dark-mode-toggle');
    if(localStorage.getItem('dhl_dark_mode')==='true') document.body.classList.add('dark-mode');
    
    if(dmBtn) {
        dmBtn.onclick = () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('dhl_dark_mode', document.body.classList.contains('dark-mode'));
        };
    }

    // Close Modals
    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(b => {
        b.onclick = function() { toggleModal(this.closest('.modal'), false); };
    });

    // ==========================================
    // 7. INICIALIZAÇÃO
    // ==========================================
    setupSelects();
    updateUI();
    renderHistory();
    checkActiveTimer();
});
