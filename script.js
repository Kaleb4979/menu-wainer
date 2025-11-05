// ====================================
// CONFIGURACIÓN (Variables tomadas de menu_data.json)
// ====================================
let MENU_DATA = null;
let ALL_ITEMS_MAP = {}; 
let cart = {}; 
let currentMesa = null; 
let deliveryFee = 0;
let userLocation = null;

// --- Funciones de Utilidad ---

function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (value) => (value * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; 
    
    return distance;
}

function getDeliveryCost(distanceKm) {
    const ratePerKm = 1.00;
    const minCost = 1.00;
    return Math.max(minCost, distanceKm * ratePerKm); 
}

// --- LÓGICA DE PERSONALIZACIÓN: NUEVA FUNCIÓN ---
/**
 * Agrega un producto al carrito, capturando las opciones de personalización (checkboxes y notas).
 */
function addItemWithDetails(id, name, price, itemElement) {
    let details = [];
    
    // 1. Recoger opciones de Checkbox
    const checkboxes = itemElement.querySelectorAll('.opciones-grupo input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb.checked) {
            details.push(cb.value);
        }
    });

    // 2. Recoger notas de la caja de texto
    const notesBox = itemElement.querySelector('.instrucciones-box');
    const notes = notesBox ? notesBox.value.trim() : '';
    
    if (notes) {
        details.push(`Nota: ${notes}`);
    }

    // 3. Crear el nombre completo del producto y un ID único para la personalización
    const itemDetails = details.length > 0 ? ` (${details.join(', ')})` : '';
    const uniqueId = `${id}-${Date.now()}`;
    const itemName = name + itemDetails;

    // 4. Agregar al carrito
    cart[uniqueId] = { 
        id: uniqueId,
        name: itemName, 
        price: price, 
        basePrice: price,
        quantity: 1,
        // Almacenamos el ID base para futuras referencias si es necesario
        baseId: id 
    };
    
    // 5. Limpiar y resetear UI después de añadir
    if (notesBox) {
        notesBox.value = '';
        checkboxes.forEach(cb => {
            if (cb.getAttribute('data-default-checked') === 'true') {
                cb.checked = true;
            } else {
                cb.checked = false;
            }
        });
    }

    updateCartDisplay();
}

// Lógica para quitar un item personalizado del carrito (como ya no hay +/-)
function removeItemFromCart(uniqueId) {
    if (cart[uniqueId]) {
        delete cart[uniqueId];
    }
    updateCartDisplay();
}

// --- Función principal para cargar el menú ---
async function loadMenuData() {
    try {
        const response = await fetch('menu_data.json');
        if (!response.ok) {
            throw new Error('No se pudo cargar menu_data.json');
        }
        const data = await response.json();
        MENU_DATA = data;
        
        // >> LÓGICA DE DETECCIÓN DE MESA <<
        const mesaParam = getUrlParameter('mesa');
        const orderOptionsEl = document.querySelector('.order-options');
        const mesaInfoEl = document.getElementById('mesa-info');
        
        if (mesaParam && !isNaN(parseInt(mesaParam))) {
            currentMesa = parseInt(mesaParam);
            
            if (mesaInfoEl) { 
                mesaInfoEl.style.display = 'block';
                mesaInfoEl.textContent = `¡Estás pidiendo desde la MESA N° ${currentMesa}! Tu pedido es para comer en local.`;
            }
            
            if (orderOptionsEl) { 
                orderOptionsEl.style.display = 'none';
            }
            
        } else {
            currentMesa = null;
            if (orderOptionsEl) { 
                orderOptionsEl.style.display = 'flex'; 
            }
        }
        
        // 1. Inicializar el mapa de ítems y poblar la información del header
        document.getElementById('promo-container').textContent = data.info.promo;
        document.getElementById('schedule-container').innerHTML = `🕔 **HORARIO DE ATENCIÓN:** ${data.info.schedule}`;
        
        let menuHtml = '';
        data.categories.forEach(category => {
            menuHtml += `
                <section class="menu-category">
                    <h2>${category.name}</h2>
                    <p class="slogan">${category.slogan}</p>
                    <div class="menu-item-list">
            `;

            category.items.forEach(item => {
                ALL_ITEMS_MAP[item.id] = item;
                
                const topVentaTag = item.top_venta ? '<span class="top-venta-tag">⭐ TOP VENTA</span>' : '';
                
                // --- Generar Opciones (Checkboxes) si existen ---
                let optionsHTML = '';
                let placeholderText = 'Instrucciones Especiales: (Ej: Poco queso, sin lechuga)';

                if (item.options) {
                    optionsHTML += '<h3 class="opciones-titulo">Personaliza tu ' + item.name + ':</h3>';
                    optionsHTML += '<div class="opciones-grupo">';
                    item.options.forEach(option => {
                        const isChecked = option.checked ? 'checked' : '';
                        const defaultAttr = option.checked ? 'data-default-checked="true"' : '';
                        optionsHTML += `
                            <label>
                                <input type="checkbox" value="${option.value}" ${isChecked} ${defaultAttr}> 
                                ${option.label}
                            </label>`;
                    });
                    optionsHTML += '</div>';
                    placeholderText = 'Instrucciones: (Ej: Sin pepinillos, extra queso)';
                }


                // --- Generar el HTML del Item ---
                menuHtml += `
                    <div class="menu-item-complex" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
                        <div class="item-header">
                            <span class="item-title">${item.name} ${topVentaTag}</span>
                            <span class="price">${item.price.toFixed(2)}$</span>
                        </div>
                        ${optionsHTML}
                        <textarea placeholder="${placeholderText}" rows="2" class="instrucciones-box"></textarea>
                        <button class="add-to-cart-btn full-width" onclick="addItemWithDetails('${item.id}', '${item.name}', ${item.price}, this.parentNode)">
                            Añadir ${item.name} al Pedido
                        </button>
                    </div>
                `;
            });

            menuHtml += `
                    </div>
                </section>
            `;
        });

        document.getElementById('menu-content-container').innerHTML = menuHtml;
        
        // 2. Iniciar el loop de actualización
        updateCartDisplay();
        setInterval(updateCartDisplay, 1000);

    } catch (error) {
        console.error("Error al cargar o renderizar el menú:", error);
        document.getElementById('menu-content-container').innerHTML = `<p style="color:red; text-align:center;">❌ ERROR: No se pudo cargar el menú. Verifica que el archivo **menu_data.json** exista y esté correcto.</p>`;
    }
}


// --- Funciones de Carrito y Display ---

function updateCartDisplay() {
    if (!MENU_DATA) return;

    let subtotal = 0;
    let totalItems = 0;
    
    for (const uniqueId in cart) {
        const item = cart[uniqueId];
        subtotal += item.price * item.quantity;
        totalItems += item.quantity; // Siempre es 1 en esta lógica de personalización
    }
    
    // Si es un pedido de mesa, siempre es para consumo en local, ignoramos el checkbox
    const isDelivery = currentMesa ? false : document.getElementById('delivery-checkbox').checked; 
    
    const deliveryDetails = document.getElementById('delivery-details');
    const checkoutBtn = document.getElementById('checkout-btn');

    // Deshabilitación por Límite de tiempo
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    const now = Date.now();
    const COOLDOWN_SECS = MENU_DATA.info.cooldown_seconds;
    
    if (lastOrderTime && (now - lastOrderTime) < (COOLDOWN_SECS * 1000)) {
        checkoutBtn.disabled = true;
        const remainingSeconds = Math.ceil((COOLDOWN_SECS * 1000 - (now - lastOrderTime)) / 1000);
        checkoutBtn.textContent = `ESPERA: ${remainingSeconds}s para nuevo pedido`;
    } else {
        checkoutBtn.disabled = totalItems === 0;
    }


    // Lógica del Delivery/Mesa y display de totales
    let currentTotal = subtotal;

    document.getElementById('cart-total-price').textContent = subtotal.toFixed(2);
    
    if (currentMesa) {
        // Pedido de MESA
        deliveryDetails.textContent = "";
        if (totalItems > 0 && !checkoutBtn.disabled) {
            checkoutBtn.textContent = `Hacer Pedido MESA ${currentMesa} - Total: ${currentTotal.toFixed(2)}$`;
        }
    } else if (isDelivery) {
        // Pedido de DELIVERY
        deliveryDetails.textContent = "Costo de Delivery se calculará al confirmar la ubicación. (1$ por km, mínimo 1$)";
        
        if (totalItems > 0 && !checkoutBtn.disabled) {
             checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - Subtotal: ${subtotal.toFixed(2)}$`;
        }
    } else {
        // Pedido de RETIRO
        deliveryDetails.textContent = "Retiro en Tienda seleccionado.";
        
        if (totalItems > 0 && !checkoutBtn.disabled) {
            checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - Total: ${subtotal.toFixed(2)}$`;
        }
    }

    if (totalItems === 0) {
        document.getElementById('cart-total-price').textContent = "0.00";
    }
}


// --- Lógica de Envío ---

function sendOrder(subtotal, finalTotal, distanceKm, lat, lon) {
    
    const isDelivery = !currentMesa && document.getElementById('delivery-checkbox').checked;
    let message = "🛒 *NUEVO PEDIDO PA QUE WAINER* 🍔\n\n";
    
    // Lista de ítems
    let index = 1;
    for (const uniqueId in cart) {
        const item = cart[uniqueId];
        message += `${index}. ${item.name} - ${item.basePrice.toFixed(2)}$\n`; // La cantidad es siempre 1 por la lógica de personalización
        index++;
    }

    message += "\n----------------------------------\n";
    
    if (currentMesa) {
        // Lógica para pedidos de MESA
        message += `📍 *ORDEN DE MESA N°: ${currentMesa}*\n`;
        message += `✅ *SERVICIO:* COMER EN LOCAL 🍽️\n`;
        message += `💰 *TOTAL A PAGAR:* ${subtotal.toFixed(2)}$\n`;
        
    } else if (isDelivery) {
        // Lógica para pedidos de DELIVERY
        
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
        
        if (distanceKm > 0) {
            const deliveryCost = finalTotal - subtotal;
            
            message += `✅ *SERVICIO:* DELIVERY 🚚\n`;
            message += `📍 *DISTANCIA CALCULADA:* ${distanceKm.toFixed(2)} km\n`;
            message += `💵 *COSTO DELIVERY:* ${deliveryCost.toFixed(2)}$ (1$/km, mínimo 1$)\n`;
            message += `\n*SUBTOTAL (Comida):* ${subtotal.toFixed(2)}$\n`;
            message += `*TOTAL FINAL:* ${finalTotal.toFixed(2)}$\n`;
            message += `🗺️ *UBICACIÓN CLIENTE:* ${mapsUrl}\n`;
            
        } else {
            message += `❌ *SERVICIO:* DELIVERY (FALLIDO) 🚚\n`;
            message += `⚠️ *ATENCIÓN:* No se pudo obtener la ubicación o fue rechazada. El costo de delivery se calculará a la entrega.\n`;
            message += `\n*TOTAL A PAGAR (Comida):* ${subtotal.toFixed(2)}$\n`;
        }
    } else {
        // Lógica para pedidos de RETIRO EN TIENDA
        message += `✅ *SERVICIO:* RETIRO EN TIENDA 🚶\n`;
        message += `💰 *TOTAL A PAGAR:* ${subtotal.toFixed(2)}$\n`;
    }
    
    message += "----------------------------------\n";
    message += "\nPor favor, indique su nombre.";

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${MENU_DATA.info.whatsapp_number}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
    
    localStorage.setItem('lastOrderTime', Date.now());

    cart = {};
    updateCartDisplay();
}

function checkAndSendOrder() {
    
    if (!MENU_DATA) {
         alert("Error: El menú no se ha cargado correctamente.");
         return;
    }

    // 1. VERIFICACIÓN DEL LÍMITE DE TIEMPO
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    const now = Date.now();
    const COOLDOWN_SECS = MENU_DATA.info.cooldown_seconds;
    if (lastOrderTime && (now - lastOrderTime) < (COOLDOWN_SECS * 1000)) {
        return;
    }
    
    let subtotal = 0;
    for (const id in cart) {
        subtotal += cart[id].price * cart[id].quantity;
    }

    if (Object.keys(cart).length === 0) {
        alert("Por favor, agregue al menos un artículo al carrito antes de hacer el pedido.");
        return;
    }

    // Si es una mesa, saltamos la verificación de Delivery y Geolocalización.
    if (currentMesa) {
        sendOrder(subtotal, subtotal, 0, 0, 0); 
        return;
    }
    
    // Si NO es una mesa, revisamos si es Delivery o Retiro.
    const isDelivery = document.getElementById('delivery-checkbox').checked;

    if (!isDelivery) {
        sendOrder(subtotal, subtotal, 0, 0, 0); 
        return;
    }
    
    // Si es Delivery, intentamos obtener la ubicación y calcular
    const checkoutBtn = document.getElementById('checkout-btn');
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Calculando envío...';
    document.getElementById('loading-location').style.display = 'block';

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const clientLat = position.coords.latitude;
                const clientLon = position.coords.longitude;
                
                const ORIGIN_LAT = MENU_DATA.info.origin_lat;
                const ORIGIN_LON = MENU_DATA.info.origin_lon;
                
                const distanceKm = calculateDistance(ORIGIN_LAT, ORIGIN_LON, clientLat, clientLon);
                
                const deliveryCost = getDeliveryCost(distanceKm); 
                
                const finalTotal = subtotal + deliveryCost;

                checkoutBtn.textContent = 'Hacer Pedido';
                document.getElementById('loading-location').style.display = 'none';

                sendOrder(subtotal, finalTotal, distanceKm, clientLat, clientLon);
            },
            (error) => {
                console.error('Error de geolocalización:', error);
                
                checkoutBtn.textContent = 'Hacer Pedido (Envío Pendiente)';
                document.getElementById('loading-location').style.display = 'none';

                sendOrder(subtotal, subtotal, 0, 0, 0); // Envío pendiente
            }
        );
    } else {
        console.error('Geolocalización no soportada.');
        
        checkoutBtn.textContent = 'Hacer Pedido (Envío Pendiente)';
        document.getElementById('loading-location').style.display = 'none';
        
        sendOrder(subtotal, subtotal, 0, 0, 0); // Envío pendiente
    }
}

document.addEventListener('DOMContentLoaded', loadMenuData);
